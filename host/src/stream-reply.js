const INITIAL_ANSWER = '正在生成回复…'
export const INTERRUPTED = '本次请求因服务中断而停止，未自动重试。请核对会话后发送新请求。'

/** Durable delivery and public event projection; it never consumes reasoning text. */
export class StreamReply {
  constructor(store, port, id, report = () => {}) {
    this.store = store
    this.port = port
    this.id = id
    this.report = report
    this.desired = new Map()
    this.written = new Map()
    this.blocks = new Map()
    this.queue = Promise.resolve()
    this.lastOperation = 0
    this.blocked = false
    this.stopped = false
  }

  async start(envelope) {
    this.store.planStream(this.id)
    for (const part of ['progress', 'answer']) {
      const cardId = await this.port.create(part)
      this.store.streamTransition(this.id, part, 'planned', 'created', cardId)
      this.store.streamTransition(this.id, part, 'created', 'sending')
      let receipt
      try {
        receipt = await this.port.send(envelope, part, cardId)
      } catch {
        this.store.streamTransition(this.id, part, 'sending', 'unknown')
        throw new Error('Stream reply has an unknown delivery')
      }
      this.store.streamTransition(this.id, part, 'sending', 'delivered', null, receipt)
    }
  }

  text(part, text) {
    if (this.stopped || this.blocked || this.desired.get(part) === text) return
    this.desired.set(part, text)
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.queue = this.queue.then(() => this.flush()).catch(error => { this.fault = error })
    }, this.port.intervalMs)
  }

  frame(frame) {
    // DSH revision increases for EVERY frame, not just when an attempt changes.
    if (frame.type !== 'start' && frame.attemptId !== this.attempt) return
    if (frame.revision <= (this.revision ?? 0)) return
    this.revision = frame.revision
    if (frame.type === 'start') {
      this.attempt = frame.attemptId
      this.frameIndex = -1
      this.blocks.clear()
      this.text('progress', '正在处理请求并组织回复。')
      this.text('answer', INITIAL_ANSWER)
      return
    }
    if (frame.type === 'end') {
      if (frame.outcome.kind === 'abandoned') {
        this.blocks.clear()
        this.text('answer', INITIAL_ANSWER)
      }
      return
    }
    if (frame.type !== 'chunk' || frame.index <= this.frameIndex) return
    this.frameIndex = frame.index
    const chunk = frame.chunk
    if (chunk.type === 'reasoning-delta'
      || (chunk.type === 'block-end' && chunk.block.type === 'reasoning')) {
      this.text('progress', '正在分析请求，准备可公开的回复。')
    } else if (chunk.type === 'text-delta') {
      this.blocks.set(chunk.index, (this.blocks.get(chunk.index) ?? '') + chunk.text)
      this.projectText()
    } else if (chunk.type === 'block-end' && chunk.block.type === 'text') {
      this.blocks.set(chunk.index, chunk.block.text)
      this.projectText()
    }
  }

  projectText() {
    const text = [...this.blocks].sort(([a], [b]) => a - b).map(([, text]) => text).join('')
    if (text) {
      this.text('progress', '正文正在生成。')
      this.text('answer', text)
    }
  }

  async throttle() {
    const delay = this.port.intervalMs - (Date.now() - this.lastOperation)
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    this.lastOperation = Date.now()
  }

  async operation(row, callback, finished = false) {
    await this.throttle()
    const sequence = this.store.streamSequence(this.id, row.part)
    let success = false
    try {
      await callback(sequence)
      success = true
    } catch {
      this.report('channel_stream_update_unconfirmed')
    }
    this.store.streamUpdated(this.id, row.part, success, success && finished)
    return success
  }

  async flush() {
    if (this.stopped || this.blocked) return
    for (const row of this.store.streams(this.id)) {
      const text = this.desired.get(row.part)
      if (row.state !== 'delivered' || text === undefined || this.written.get(row.part) === text) continue
      if (!await this.operation(row, sequence => this.port.write(row.card_id, text, sequence))) {
        this.blocked = true
        return
      }
      this.written.set(row.part, text)
    }
  }

  async stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.timer = undefined
    await this.queue
    if (this.fault) throw this.fault
  }

  async finish() {
    await this.stop()
    for (const row of this.store.streams(this.id)) {
      if (row.state !== 'delivered' || row.finished) continue
      if (!await this.operation(row, sequence => this.port.close(row.card_id, row.part, sequence))) continue
      await this.operation(row, sequence =>
        this.port.replace(row.card_id, row.part, row.terminal_text ?? INTERRUPTED, sequence), true)
    }
    const rows = this.store.streams(this.id)
    return rows.length === 2 && rows.every(row => row.state === 'delivered' && row.finished)
  }
}
