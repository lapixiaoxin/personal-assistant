// Test-only loopback transport; never included in the production server profile.
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ChannelStore } from '../../packages/channel-store/src/index.js'
import { ChannelHost } from '../../plugins/dsh-channels/src/host.js'
import { toolGuardReason } from '../../plugins/dsh-channels/src/index.js'
import { normalizeFeishuEvent } from '../../channels/feishu/src/index.js'

export const name = 'lumi-channel-contract'
export const inject = ['agents', 'agentLoop', 'sessionPersistence', 'tools', 'llm']

export async function apply(ctx) {
  const config = JSON.parse(process.env.LUMI_CHANNEL_TEST_CONFIG)
  const store = new ChannelStore(join(config.dataDir, 'channels.db'), 'test')
  const replies = []
  const channel = {
    async send(envelope, text) {
      if (envelope.text === 'unknown-send') throw new Error('simulated network loss')
      replies.push({ id: envelope.id, text })
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
          appId: 'cli_test', ownerOpenId: 'ou_owner',
        })
        if (envelope) host.receive(envelope)
      } else if (request.url === '/wait') {
        await host.pump
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({
        records: store.records(), replies,
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
