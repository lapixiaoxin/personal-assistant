import { createHash } from 'node:crypto'
import { AppType, Client, defaultHttpInstance, EventDispatcher, WSClient } from '@larksuiteoapi/node-sdk'
import { createFeishuStreaming } from './streaming.js'
import { createFeishuProgress } from './progress.js'

export function validateFeishuConfig(config) {
  if (!config || typeof config !== 'object'
    || !/^cli_[A-Za-z0-9]+$/.test(config.appId)
    || typeof config.appSecret !== 'string' || config.appSecret.length < 8
    || !/^ou_[A-Za-z0-9_-]+$/.test(config.ownerOpenId)
    || (config.replyMode !== undefined && !['text', 'streaming-cards', 'native-cot'].includes(config.replyMode))
    || (config.groupChatIds !== undefined && (!Array.isArray(config.groupChatIds)
      || config.groupChatIds.length > 64
      || new Set(config.groupChatIds).size !== config.groupChatIds.length
      || config.groupChatIds.some(id => typeof id !== 'string' || !/^oc_[A-Za-z0-9_-]+$/.test(id))))
    || Object.keys(config).some(key => !['appId', 'appSecret', 'ownerOpenId', 'replyMode', 'groupChatIds'].includes(key))) {
    throw new Error('Feishu config requires appId, appSecret and ownerOpenId')
  }
  return config
}

/** Receives ONLY the authenticated official WS dispatcher's flattened event. */
export function normalizeFeishuEvent(event, config, botOpenId) {
  if (event?.app_id !== config.appId
    || event?.sender?.sender_type !== 'user'
    || event?.message?.message_type !== 'text') return undefined
  const message = event.message
  if (!/^om_[A-Za-z0-9_-]+$/.test(message.message_id)
    || !/^oc_[A-Za-z0-9_-]+$/.test(message.chat_id)
    || typeof message.content !== 'string'
    || Buffer.byteLength(message.content, 'utf8') > 16_000) return undefined
  let content
  try { content = JSON.parse(message.content) } catch { return undefined }
  if (typeof content?.text !== 'string' || Buffer.byteLength(content.text, 'utf8') > 12_000) {
    return undefined
  }
  const isPrivate = message.chat_type === 'p2p'
  const isGroup = message.chat_type === 'group'
  if ((!isPrivate && !isGroup) || (isPrivate && event.sender.sender_id?.open_id !== config.ownerOpenId)) {
    return undefined
  }
  const mention = isGroup && Array.isArray(message.mentions)
    ? message.mentions.find(candidate => candidate?.id?.open_id === botOpenId
      && typeof candidate.key === 'string' && candidate.key) : undefined
  if (isGroup && (!config.groupChatIds?.includes(message.chat_id) || !mention)) return undefined
  const rawText = isGroup ? content.text.split(mention.key).join('') : content.text
  const text = rawText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  if (!text) return undefined
  if (message.root_id !== undefined && !/^om_[A-Za-z0-9_-]+$/.test(message.root_id)) return undefined
  if (message.thread_id !== undefined && !/^omt_[A-Za-z0-9_-]+$/.test(message.thread_id)) return undefined
  const topicRoot = message.root_id ?? (isPrivate || message.thread_id ? message.message_id : undefined)
  const chat = `${config.appId}:${message.chat_id}`
  const privateControl = isPrivate && !message.root_id && !message.thread_id && text.startsWith('/')
  const replyInThread = Boolean(topicRoot) && !privateControl
  // Delivery attempt IDs/timestamps are deliberately excluded from the digest.
  return {
    id: `${config.appId}:${message.message_id}`,
    chat,
    conversation: replyInThread ? `${chat}:topic:${topicRoot}` : `${chat}:${isPrivate ? 'control' : 'group'}`,
    chatType: message.chat_type,
    replyInThread,
    sender: event.sender.sender_id.open_id,
    messageId: message.message_id,
    text: text === '/stop' ? '/stop' : text,
  }
}

export function formatReply(text) {
  if (Buffer.byteLength(text, 'utf8') <= 12_000) return text
  let prefix = ''
  for (const character of text) {
    if (Buffer.byteLength(prefix + character, 'utf8') > 11_800) break
    prefix += character
  }
  return `${prefix}\n\n[回复过长，已截断；完整生成内容保留在本机 DSH 会话。]`
}

/** Single attempt. An ambiguous result is reconciled by the host, never retried here. */
export async function sendFeishuReply(client, envelope, text) {
  try {
    const result = await client.im.message.reply({
      path: { message_id: envelope.messageId },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text: formatReply(text) }),
        reply_in_thread: envelope.replyInThread,
        uuid: createHash('sha256').update(`lumi-reply:${envelope.id}`).digest('hex').slice(0, 32),
      },
    })
    if (result.code !== 0 || typeof result.data?.message_id !== 'string'
      || !result.data.message_id.startsWith('om_')) throw new Error('Invalid receipt')
    return result.data.message_id
  } catch {
    // Platform errors can include the complete request and Authorization header.
    throw new Error('Feishu reply has no confirmed receipt')
  }
}

/** Resolves the exact Bot identity needed to authenticate group @ mentions. */
export async function fetchFeishuBotOpenId(client) {
  try {
    const result = await client.request({ method: 'GET', url: '/open-apis/bot/v3/info' })
    const openId = result?.bot?.open_id ?? result?.data?.bot?.open_id
    if (result?.code !== undefined && result.code !== 0) throw new Error('Invalid business result')
    if (typeof openId !== 'string' || !/^ou_[A-Za-z0-9_-]+$/.test(openId)) {
      throw new Error('Missing bot identity')
    }
    return openId
  } catch {
    throw new Error('Feishu Bot identity has no confirmed result')
  }
}

export function createFeishuChannel(config, report = () => {}) {
  validateFeishuConfig(config)
  // Never forward SDK log arguments: some include credentials or entire events.
  const logger = {
    debug() {}, info() {}, trace() {},
    warn() { report('feishu_warning') },
    error() { report('feishu_error') },
  }
  const httpInstance = defaultHttpInstance.create({ timeout: 15_000 })
  httpInstance.interceptors.response.use(response => response.config.$return_headers
    ? { data: response.data, headers: response.headers }
    : response.data)
  const client = new Client({
    appId: config.appId, appSecret: config.appSecret,
    appType: AppType.SelfBuild, logger,
    httpInstance,
  })
  let ws
  const cardPort = createFeishuStreaming(client)
  const nativePort = { ...cardPort, progress: createFeishuProgress(client) }
  return {
    streaming: config.replyMode === 'native-cot' ? nativePort
      : config.replyMode === 'streaming-cards' ? cardPort : undefined,
    recoveryStreaming: nativePort,
    async start(receive) {
      const botOpenId = config.groupChatIds?.length ? await fetchFeishuBotOpenId(client) : undefined
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws?.close({ force: true })
          reject(new Error('Feishu connection did not become ready within 25 seconds'))
        }, 25_000)
        ws = new WSClient({
          appId: config.appId,
          appSecret: config.appSecret,
          logger,
          handshakeTimeoutMs: 10_000,
          wsConfig: { pingTimeout: 15 },
          onReady() { clearTimeout(timer); resolve() },
          onError() {
            clearTimeout(timer)
            report('feishu_connection_failed')
            reject(new Error('Feishu connection failed; check application configuration'))
          },
          onReconnecting() { report('feishu_reconnecting') },
          onReconnected() { report('feishu_connected') },
        })
        const eventDispatcher = new EventDispatcher({ logger }).register({
          'im.message.receive_v1': event => {
            const envelope = normalizeFeishuEvent(event, config, botOpenId)
            if (envelope) receive(envelope) // Must commit before the dispatcher acknowledges.
          },
        })
        void ws.start({ eventDispatcher }).catch(() => {
          clearTimeout(timer)
          reject(new Error('Feishu connection startup failed'))
        })
      })
    },
    send(envelope, text) { return sendFeishuReply(client, envelope, text) },
    status() { return ws?.getConnectionStatus().state ?? 'idle' },
    close() { ws?.close({ force: true }) },
  }
}
