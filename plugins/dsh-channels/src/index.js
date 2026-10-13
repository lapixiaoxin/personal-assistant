import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ChannelStore } from '@lumi/channel-store'
import { createFeishuChannel } from '@lumi/feishu-channel'
import { readServerConfig } from './config.js'
import { ChannelHost } from './host.js'

export const name = 'lumi-channels'
export const inject = ['agents', 'agentLoop', 'sessionPersistence', 'tools', 'llm']

export function toolGuardReason(name) {
  return name === 'lumi_context_status'
    ? undefined
    : 'This capability is not enabled in the lumi server profile.'
}

export async function apply(ctx, options) {
  const config = readServerConfig(options.configPath)
  ctx.tools.guard(execution => toolGuardReason(execution.name))
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  const statusPath = join(config.dataDir, 'status.json')
  let channel
  const report = event => {
    writeFileSync(statusPath, JSON.stringify({
      event, channel: channel?.status() ?? 'starting', at: new Date().toISOString(),
    }), { mode: 0o600 })
  }
  const store = new ChannelStore(join(config.dataDir, 'channels.db'),
    `${config.ownerId}:${config.feishu.appId}:${config.feishu.ownerOpenId}`)
  channel = createFeishuChannel(config.feishu, report)
  const host = new ChannelHost(ctx, store, channel, config, report)
  ctx.effect(() => () => host.close(), 'lumi.channels.lifecycle()')
  try {
    await channel.start(envelope => host.receive(envelope))
    report('ready')
    host.wake()
  } catch (error) {
    await host.close()
    throw error
  }
}
