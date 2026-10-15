import { createHash } from 'node:crypto'

const PATH = '/open-apis/im/v1/message_cot'
const key = value => createHash('sha256').update(value).digest('hex').slice(0, 24)
const statusText = {
  running: { zh_cn: '正在处理', en_us: 'Working' },
  thinking: { zh_cn: '正在分析请求', en_us: 'Processing request' },
  done: { zh_cn: '处理完成', en_us: 'Completed' },
  error: { zh_cn: '处理未完成', en_us: 'Not completed' },
  paused: { zh_cn: '已暂停', en_us: 'Paused' },
  interrupted: { zh_cn: '已停止', en_us: 'Stopped' },
}

/** Converts only public host events; no model or tool payload reaches this adapter. */
export function progressEvents(target, events, timestamp) {
  const run = { threadId: target.receipt, runId: key(target.cot_id) }
  const result = []
  function add(event_type, content) {
    const event = { event_type, content: JSON.stringify(content), timestamp: timestamp++ }
    if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 4096) throw new Error('Progress event too large')
    result.push(event)
  }
  for (const event of events) {
    if (event.kind === 'started') {
      add('RUN_STARTED', { ...run, input: { statusText } })
    } else if (event.kind === 'stage') {
      const messageId = `stage-${timestamp}`
      add('TEXT_MESSAGE_START', { messageId, role: 'assistant' })
      add('TEXT_MESSAGE_CONTENT', { messageId, delta: event.text })
      add('TEXT_MESSAGE_END', { messageId })
    } else if (event.kind === 'tool_started') {
      const toolCallId = key(event.id)
      add('TOOL_CALL_START', { toolCallId, toolCallName: event.name, title: event.title, icon: 'default' })
      add('TOOL_CALL_END', { toolCallId })
    } else if (event.kind === 'tool_finished') {
      add('TOOL_CALL_RESULT', {
        toolCallId: key(event.id), messageId: `result-${key(event.id)}`, role: 'tool',
        status: event.failed ? 'error' : 'success', isError: event.failed,
        content: event.failed ? '调用未成功。' : '调用已完成。',
      })
    } else if (event.kind === 'finished') {
      if (event.status === 'error') {
        add('RUN_ERROR', { ...run, message: '本次处理未正常完成。', code: 'TURN_FAILED' })
      } else {
        add('RUN_FINISHED', { ...run, status: event.status })
      }
    } else {
      throw new Error('Unsupported public progress event')
    }
  }
  if (!result.length || result.length > 48) throw new Error('Invalid progress batch')
  return result
}

/** Native COT creation sends immediately. Each request is attempted exactly once. */
export function createFeishuProgress(client) {
  async function checked(payload) {
    try {
      const result = await client.request(payload)
      if (result?.code !== 0) throw new Error('Invalid business result')
      return result.data
    } catch {
      throw new Error('Feishu progress operation has no confirmed result')
    }
  }
  return {
    async start(envelope) {
      const chat = envelope.chat.split(':').at(-1)
      if (!/^oc_[A-Za-z0-9_-]+$/.test(chat)) throw new Error('Invalid progress receiver')
      const data = await checked({
        method: 'POST', url: PATH, params: { receive_id_type: 'chat_id' },
        data: { receive_id: chat, origin_message_id: envelope.messageId, reply_in_thread: false },
      })
      if (typeof data?.cot_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(data.cot_id)
        || typeof data?.message_id !== 'string' || !/^om_[A-Za-z0-9_-]+$/.test(data.message_id)) {
        throw new Error('Feishu progress has no confirmed identity')
      }
      return { id: data.cot_id, receipt: data.message_id }
    },
    async append(target, events, timestamp) {
      await checked({
        method: 'PUT', url: PATH,
        data: {
          cot_id: target.cot_id, message_id: target.receipt,
          events: progressEvents(target, events, timestamp),
        },
      })
    },
    async complete(target) {
      await checked({
        method: 'POST', url: `${PATH}/complete/${encodeURIComponent(target.cot_id)}`,
        params: { message_id: target.receipt, reason: target.terminal_status === 'done' ? 'done' : 'error' },
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        transformRequest: [() => ''],
      })
    },
  }
}
