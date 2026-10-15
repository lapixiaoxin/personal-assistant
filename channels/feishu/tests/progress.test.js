import { describe, expect, it, vi } from 'vitest'
import { createFeishuProgress, progressEvents } from '../src/progress.js'
import { normalizeFeishuEvent, validateFeishuConfig } from '../src/index.js'

const target = { cot_id: 'cot_test', receipt: 'om_progress', terminal_status: 'done' }

describe('native Feishu progress protocol', () => {
  it('creates in the real chat, appends ordered serialized events, then completes with empty body', async () => {
    const request = vi.fn().mockResolvedValue({ code: 0, data: { cot_id: 'cot_test', message_id: 'om_progress' } })
    const port = createFeishuProgress({ request })
    expect(await port.start({ chat: 'cli_test:oc_chat', messageId: 'om_input' }))
      .toEqual({ id: 'cot_test', receipt: 'om_progress' })
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST', params: { receive_id_type: 'chat_id' },
      data: { receive_id: 'oc_chat', origin_message_id: 'om_input', reply_in_thread: false },
    })
    await port.append(target, [
      { kind: 'started' }, { kind: 'stage', text: '正在处理' },
      { kind: 'tool_started', id: 'call', name: 'tool', title: '请求工具调用' },
      { kind: 'tool_finished', id: 'call', failed: true },
      { kind: 'finished', status: 'interrupted' },
    ], 1000)
    const events = request.mock.calls[1][0].data.events
    expect(events.map(event => event.event_type)).toEqual([
      'RUN_STARTED', 'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END',
      'TOOL_CALL_START', 'TOOL_CALL_END', 'TOOL_CALL_RESULT', 'RUN_FINISHED',
    ])
    expect(events.map(event => event.timestamp)).toEqual([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007])
    const contents = events.map(event => JSON.parse(event.content))
    expect(contents[4].toolCallId).toBe(contents[6].toolCallId)
    expect(contents[0].runId).toBe(contents[7].runId)
    expect(contents[7].status).toBe('interrupted')
    await port.complete({ ...target, terminal_status: 'interrupted' })
    const complete = request.mock.calls[2][0]
    expect(complete.params).toEqual({ message_id: 'om_progress', reason: 'error' })
    expect(complete.transformRequest[0]()).toBe('')
  })

  it('never retries ambiguous creation and rejects business errors, missing IDs and invalid payloads', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Authorization: secret'))
    const port = createFeishuProgress({ request })
    const envelope = { chat: 'app:oc_chat', messageId: 'om_input' }
    await expect(port.start(envelope)).rejects.toThrow('no confirmed result')
    expect(request).toHaveBeenCalledTimes(1)
    request.mockResolvedValue({ code: 1, msg: 'private' })
    await expect(port.complete(target)).rejects.not.toThrow('private')
    request.mockResolvedValue({ code: 0, data: {} })
    await expect(port.start(envelope)).rejects.toThrow('no confirmed identity')
    expect(() => progressEvents(target, [{ kind: 'stage', text: '你'.repeat(4096) }], 1)).toThrow('too large')
    expect(() => progressEvents(target, Array(17).fill({ kind: 'stage', text: 'ok' }), 1)).toThrow('batch')
    expect(() => progressEvents(target, [{ kind: 'reasoning', text: 'private' }], 1)).toThrow('Unsupported')
  })

  it('routes the native stop button through existing owner authentication', () => {
    const config = { appId: 'cli_test', appSecret: 'synthetic-secret', ownerOpenId: 'ou_owner', replyMode: 'native-cot' }
    expect(validateFeishuConfig(config)).toBe(config)
    const event = {
      app_id: config.appId,
      sender: { sender_type: 'user', sender_id: { open_id: 'ou_owner' } },
      message: {
        message_id: 'om_stop', chat_id: 'oc_chat', chat_type: 'p2p',
        message_type: 'text', content: JSON.stringify({ text: ' \u200b/stop\uFEFF ' }),
      },
    }
    expect(normalizeFeishuEvent(event, config).text).toBe('/stop')
    event.sender.sender_id.open_id = 'ou_stranger'
    expect(normalizeFeishuEvent(event, config)).toBeUndefined()
  })
})
