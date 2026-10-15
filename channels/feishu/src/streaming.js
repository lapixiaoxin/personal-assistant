import { createHash } from 'node:crypto'

const ELEMENT = 'stream_body'
const NOTICE = '\n\n[回复过长，已截断；完整生成内容保留在本机 DSH 会话。]'

// Budget against escaped JSON, including the enclosing card and update request.
export function formatCardText(text) {
  if (Buffer.byteLength(JSON.stringify(text), 'utf8') <= 12_000) return text
  let prefix = ''
  let size = Buffer.byteLength(JSON.stringify(NOTICE), 'utf8')
  for (const character of text) {
    const bytes = Buffer.byteLength(JSON.stringify(character), 'utf8') - 2
    if (size + bytes > 12_000) break
    prefix += character
    size += bytes
  }
  return prefix + NOTICE
}

export function replyCard(part, text, streaming = true) {
  const markdown = { tag: 'markdown', element_id: ELEMENT, content: formatCardText(text) }
  return {
    schema: '2.0',
    config: {
      update_multi: true, streaming_mode: streaming,
      ...(part === 'progress' ? { width_mode: 'compact' } : {}),
      summary: { content: part === 'progress' ? 'lumi · 处理进度' : 'lumi · 回复' },
      ...(streaming ? { streaming_config: {
        print_frequency_ms: { default: 70 }, print_step: { default: 1 }, print_strategy: 'fast',
      } } : {}),
    },
    body: {
      ...(part === 'progress' ? { padding: '8px' } : {}),
      elements: part === 'progress' ? [{
        tag: 'collapsible_panel', expanded: false, padding: '0px',
        header: {
          title: { tag: 'plain_text', content: '处理进度' },
          width: 'auto_when_fold', padding: '0px',
          icon: {
            tag: 'standard_icon', token: 'down-small-ccm_outlined',
            color: 'grey', size: '16px 16px',
          },
          icon_position: 'follow_text', icon_expanded_angle: -180,
        },
        elements: [markdown],
      }] : [markdown],
    },
  }
}

const uuid = value => createHash('sha256').update(value).digest('hex').slice(0, 32)

/** Each method performs one attempt and returns only sanitized failures. */
export function createFeishuStreaming(client) {
  async function checked(operation) {
    try {
      const result = await operation()
      if (result?.code !== 0) throw new Error('Invalid business result')
      return result.data
    } catch {
      throw new Error('Feishu card operation has no confirmed result')
    }
  }
  return {
    intervalMs: 300,
    async create(part) {
      const data = await checked(() => client.cardkit.v1.card.create({
        data: { type: 'card_json', data: JSON.stringify(replyCard(part,
          part === 'progress' ? '已收到请求，正在准备回复。' : '正在生成回复…')) },
      }))
      if (typeof data?.card_id !== 'string' || !data.card_id) {
        throw new Error('Feishu card has no confirmed identity')
      }
      return data.card_id
    },
    async send(envelope, part, cardId) {
      const data = await checked(() => client.im.message.reply({
        path: { message_id: envelope.messageId },
        data: {
          msg_type: 'interactive',
          content: JSON.stringify({ type: 'card', data: { card_id: cardId } }),
          uuid: uuid(`lumi-stream:${envelope.id}:${part}`),
        },
      }))
      if (typeof data?.message_id !== 'string' || !data.message_id.startsWith('om_')) {
        throw new Error('Feishu card has no confirmed receipt')
      }
      return data.message_id
    },
    async write(cardId, text, sequence) {
      await checked(() => client.cardkit.v1.cardElement.content({
        path: { card_id: cardId, element_id: ELEMENT },
        data: { content: formatCardText(text), sequence, uuid: uuid(`${cardId}:${sequence}`) },
      }))
    },
    async close(cardId, part, sequence) {
      await checked(() => client.cardkit.v1.card.settings({
        path: { card_id: cardId },
        data: {
          settings: JSON.stringify({ config: {
            streaming_mode: false,
            summary: { content: part === 'progress' ? 'lumi · 处理进度已结束' : 'lumi · 回复已结束' },
          } }),
          sequence, uuid: uuid(`${cardId}:${sequence}`),
        },
      }))
    },
    async replace(cardId, part, text, sequence) {
      await checked(() => client.cardkit.v1.card.update({
        path: { card_id: cardId },
        data: {
          card: { type: 'card_json', data: JSON.stringify(replyCard(part, text, false)) },
          sequence, uuid: uuid(`${cardId}:${sequence}`),
        },
      }))
    },
  }
}
