// Test-only loopback transport; never included in the production server profile.
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeFeishuEvent } from '../../channels/feishu/src/index.js'
import { ChannelHost } from '../../host/src/channel-host.js'
import { ChannelStore } from '../../host/src/channel-store.js'
import { toolGuardReason } from '../../host/src/plugin.js'

export const name = 'lumi-channel-contract'
export const inject = ['agents', 'agentLoop', 'sessionPersistence', 'tools', 'llm']

export async function apply(ctx) {
  const config = JSON.parse(process.env.LUMI_CHANNEL_TEST_CONFIG)
  const store = new ChannelStore(join(config.dataDir, 'channels.db'), 'test')
  const replies = []
  const updates = []
  let cards = 0
  let streamEnded = false
  ctx.on('session/event', (session, event) => {
    if (session.id && event.type === 'turn/end') streamEnded = true
  })
  const streaming = {
    intervalMs: 30,
    async create() { return `card_${++cards}` },
    async send(envelope, part, cardId) {
      if (envelope.text === 'unknown-send') throw new Error('simulated network loss')
      replies.push({ id: envelope.id, part, cardId, replyInThread: envelope.replyInThread })
      return `om_reply_${replies.length}`
    },
    async write(cardId, text, sequence) {
      updates.push({ kind: 'write', cardId, text, sequence, beforeEnd: !streamEnded })
    },
    async close(cardId, part, sequence) {
      updates.push({ kind: 'close', cardId, part, sequence })
    },
    async replace(cardId, part, text, sequence) {
      updates.push({ kind: 'replace', cardId, part, text, sequence })
    },
  }
  const nativeStreaming = {
    ...streaming,
    progress: {
      async start(envelope) {
        if (envelope.text === 'unknown-send') throw new Error('simulated network loss')
        const cotId = `cot_${envelope.messageId}`
        replies.push({ id: envelope.id, part: 'progress', cotId, replyInThread: envelope.replyInThread })
        return { id: cotId, receipt: `om_reply_${replies.length}` }
      },
      async append(target, events, timestamp) {
        updates.push({ kind: 'progress', cotId: target.cot_id, events, timestamp, beforeEnd: !streamEnded })
      },
      async complete(target) {
        updates.push({ kind: 'complete', cotId: target.cot_id, status: target.terminal_status })
      },
    },
  }
  const channel = {
    streaming: config.streaming === 'native' ? nativeStreaming : config.streaming ? streaming : undefined,
    recoveryStreaming: nativeStreaming,
    async send(envelope, text) {
      if (envelope.text === 'unknown-send') throw new Error('simulated network loss')
      replies.push({ id: envelope.id, text, replyInThread: envelope.replyInThread })
      return `om_reply_${replies.length}`
    },
    close() {},
    status() { return 'fixture' },
  }
  ctx.tools.guard(execution => toolGuardReason(execution.name))
  const host = new ChannelHost(ctx, store, channel, config)
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${config.token}`) {
      response.writeHead(401).end()
      return
    }
    try {
      if (request.url === '/input' && request.method === 'POST') {
        let body = ''
        for await (const chunk of request) body += chunk.toString()
        const envelope = normalizeFeishuEvent(JSON.parse(body), {
          appId: 'cli_test', ownerOpenId: 'ou_owner', groupChatIds: config.groupChatIds,
        }, config.botOpenId)
        if (envelope) host.receive(envelope)
      } else if (request.url === '/wait') {
        await host.pump
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        records: store.records(), envelopes: store.envelopes(), replies, updates,
        unresolvedStreams: store.streamStatus(),
        sessions: ctx.agents.list().map(agent => agent.id),
      }))
      if (request.url === '/crash') setTimeout(() => process.kill(process.pid, 'SIGKILL'), 20)
    } catch {
      response.writeHead(500).end('fixture failed')
    }
  })
  ctx.effect(() => async () => {
    await host.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  writeFileSync(join(config.dataDir, 'ready.json'), JSON.stringify({
    port: server.address().port,
  }))
  host.wake()
}
