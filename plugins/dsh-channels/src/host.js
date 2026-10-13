import { createUserMessage } from '@deepseek-ai/dsh-llm'

const HELP = '我是 lumi，你的个人管家。\n直接发送文字开始对话。\n/help 帮助\n/new 开始新会话\n/cancel 取消当前生成和排队请求\n/status 查看通道回执状态\n\n当前仅启用对话；外部 Agent、设备和动作能力尚未配置。'

/** Maps a durable transport queue to DSH. No planning, routing, or tool execution here. */
export class ChannelHost {
  constructor(ctx, store, channel, config, report = () => {}) {
    this.ctx = ctx
    this.store = store
    this.channel = channel
    this.config = config
    this.report = report
    this.handles = new Map()
    this.closed = false
    this.pump = undefined
    this.active = undefined
    this.failed = false
  }

  receive(envelope) {
    if (this.closed || this.failed) throw new Error('Channel is not accepting input')
    if (!this.store.accept(envelope)) return
    if (envelope.text === '/cancel') {
      this.store.transition(envelope.id, 'queued', 'running')
      this.store.cancelQueued(envelope.chat, envelope.id)
      if (this.active?.chat === envelope.chat) {
        this.active.cancelled = true
        this.active.handle?.agent.cancel({ kind: 'user' })
      }
      this.store.transition(envelope.id, 'running', 'ready',
        '已请求取消当前生成并清除排队输入。已经产生的外部影响不会因此撤销。')
    }
    this.wake()
  }

  wake() {
    if (this.closed || this.failed || this.pump) return
    // Schedule AFTER the synchronous intake transaction and platform callback.
    this.pump = Promise.resolve().then(() => this.drain())
      .catch(() => {
        this.failed = true
        this.report('channel_storage_or_driver_failed')
      })
      .finally(() => {
        this.pump = undefined
        if (!this.closed && !this.failed && this.store.next()) this.wake()
      })
  }

  async drain() {
    while (!this.closed) {
      const row = this.store.next()
      if (!row) return
      if (row.state === 'queued') {
        this.store.transition(row.id, 'queued', 'running')
        let reply
        try { reply = await this.handle(row.envelope) } catch {
          reply = '本次请求未正常完成，未自动重试。可重新描述请求；会话无法恢复时使用 /new。'
          this.report('channel_turn_failed')
        }
        if (this.closed) return // Leave running for explicit restart classification.
        this.store.transition(row.id, 'running', 'ready', reply)
      } else {
        this.store.transition(row.id, 'ready', 'sending')
        try {
          const receipt = await this.channel.send(row.envelope, row.reply)
          this.store.transition(row.id, 'sending', 'sent', null, receipt)
        } catch {
          this.store.transition(row.id, 'sending', 'unknown')
          this.report('channel_reply_unknown')
        }
      }
    }
  }

  async handle(envelope) {
    if (envelope.text === '/help') return HELP
    if (envelope.text === '/status') {
      return `通道：${this.channel.status()}\n${this.store.status()
        .map(row => `${row.state}: ${row.count}`).join('\n')}\ninterrupted / unknown 不自动重试，请在本机核对会话及飞书消息。`
    }
    if (envelope.text === '/new') {
      const old = this.store.session(envelope.chat)
      const handle = this.handles.get(old)
      if (handle) await handle.dispose()
      this.handles.delete(old)
      // Create before replying: the new session is ready for the next message.
      const mapping = this.store.conversation(envelope.chat, true)
      this.handles.set(mapping.session, await this.create(mapping))
      return '已开始新会话。个人上下文仍按配置加载，旧会话记录保留在本机。'
    }
    if (envelope.text.startsWith('/')) return HELP
    const active = { chat: envelope.chat, cancelled: false, handle: undefined }
    this.active = active
    try {
      const mapping = this.store.conversation(envelope.chat)
      let handle = this.handles.get(mapping.session)
      if (!handle) {
        handle = await this.create(mapping)
        this.handles.set(mapping.session, handle)
      }
      active.handle = handle
      if (active.cancelled || this.closed) return '本次生成已取消。'
      let response = ''
      let reason
      const dispose = this.ctx.on('session/event', (session, event) => {
        if (session.id !== handle.agent.session.id) return
        if (event.type === 'assistant/message') {
          response = event.data.message.content.filter(block => block.type === 'text')
            .map(block => block.text).join('')
        }
        if (event.type === 'turn/end') reason = event.data.reason.kind
      })
      const timer = setTimeout(() => {
        active.cancelled = true
        handle.agent.cancel({ kind: 'user' })
      }, this.config.turnTimeoutMs ?? 120_000)
      try {
        handle.agent.followup(createUserMessage({
          content: [{ type: 'text', text: envelope.text }],
          source: { kind: 'user' },
        }))
        await handle.agent.whenIdle()
      } finally {
        clearTimeout(timer)
        dispose()
      }
      if (active.cancelled) return '本次生成已取消或达到时限，未自动重试。'
      if (reason !== 'completed' || !response.trim()) throw new Error('DSH turn did not complete')
      return response
    } finally {
      this.active = undefined
    }
  }

  create(mapping) {
    const allow = this.config.personalContextPath ? ['lumi_context_status'] : []
    const options = {
      agentOptions: this.config.model,
      setup(agentCtx) {
        agentCtx.tools.restrict({ allow })
        agentCtx.on('agent/created', ({ agent, source }) => {
          // Do not replay persisted pending input after an ambiguous crash.
          // DSH holds the loop until this initialization callback completes.
          if (source === 'resume') agent.inbox.clear()
        })
      },
    }
    return mapping.fresh
      ? this.ctx.agents.create({
        ...options, sessionId: mapping.session, meta: { cwd: this.config.workspace },
      })
      : this.ctx.agents.resume({ ...options, resumeSessionId: mapping.session })
  }

  async close() {
    this.closed = true
    this.channel.close()
    if (this.active) {
      this.active.cancelled = true
      this.active.handle?.agent.cancel({ kind: 'user' })
    }
    await this.pump
    for (const handle of this.handles.values()) await handle.dispose()
    this.handles.clear()
    this.store.close()
  }
}
