const TOOL_TITLES = new Map([['lumi_context_status', '检查个人上下文状态']])

/** Bounded public projection. It never inspects reasoning, tool arguments or result content. */
export class StreamProgress {
  constructor(stream, port) {
    this.stream = stream
    this.port = port
    this.pending = []
    this.stages = new Set()
    this.tools = new Map()
    this.blocked = false
  }

  row() {
    return this.stream.store.streams(this.stream.id).find(row => row.part === 'progress')
  }

  async start(envelope) {
    const { store, id } = this.stream
    store.streamTransition(id, 'progress', 'planned', 'sending')
    let target
    try {
      target = await this.port.start(envelope)
    } catch {
      store.streamTransition(id, 'progress', 'sending', 'unknown')
      throw new Error('Stream reply has an unknown delivery')
    }
    store.streamTransition(id, 'progress', 'sending', 'delivered', null, target.receipt, target.id)
    await this.append([
      { kind: 'started' }, { kind: 'stage', text: '已收到请求，正在准备回复。' },
    ])
  }

  enqueue(event) {
    if (this.stream.stopped || this.blocked) return
    if (this.pending.length >= 100) {
      this.blocked = true
      this.stream.store.progressIncomplete(this.stream.id)
      this.stream.report('channel_progress_event_limit')
      return
    }
    this.pending.push(event)
    this.stream.schedule()
  }

  stage(text) {
    if (this.blocked || this.stream.stopped || this.stages.has(text)) return
    this.stages.add(text)
    this.enqueue({ kind: 'stage', text })
  }

  event(event) {
    if (this.blocked || this.stream.stopped) return
    if (event.type === 'tool/call') {
      const { callId, name } = event.data
      if (this.tools.has(callId) || this.tools.size >= 200) return
      this.tools.set(callId, false)
      this.enqueue({
        kind: 'tool_started', id: callId,
        name: TOOL_TITLES.has(name) ? name : 'tool',
        title: TOOL_TITLES.get(name) ?? '请求工具调用',
      })
    } else if (event.type === 'tool/result') {
      const message = event.data.message
      if (!this.tools.has(message.toolCallId) || this.tools.get(message.toolCallId)) return
      this.tools.set(message.toolCallId, true)
      this.enqueue({ kind: 'tool_finished', id: message.toolCallId, failed: message.isError === true })
    }
  }

  async append(events, terminal = false) {
    const { store, id } = this.stream
    // Each public event maps to at most three platform events. Reserve conservatively.
    const count = events.length * 3
    if (!terminal && this.row().event_count + count > 900) {
      this.blocked = true
      store.progressIncomplete(id)
      this.stream.report('channel_progress_event_limit')
      return
    }
    await this.stream.throttle()
    const timestamp = store.progressReserve(id, count, terminal)
    let success = false
    try {
      await this.port.append(this.row(), events, timestamp)
      success = true
    } catch {
      this.blocked = true
      this.stream.report('channel_progress_append_unconfirmed')
    }
    store.progressAppended(id, success, terminal)
  }

  async flush() {
    while (this.pending.length && !this.blocked) await this.append(this.pending.splice(0, 16))
    if (this.blocked) this.pending.length = 0
  }

  async finish(row) {
    if (row.terminal_event === 'planned') {
      await this.append([{ kind: 'finished', status: row.terminal_status }], true)
    }
    // Complete sets the known run's state; it never repeats an append or creates a message.
    await this.stream.operation(this.row(), () => this.port.complete(this.row()), true)
  }
}
