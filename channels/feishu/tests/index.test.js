import { EventDispatcher } from '@larksuiteoapi/node-sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  acceptsAllGroupChats, acceptsGroupChat, fetchFeishuBotOpenId, formatReply, groupChatEnabled,
  normalizeFeishuEvent, sendFeishuReply, validateFeishuConfig,
} from '../src/index.js'

const config = { appId: 'cli_test', appSecret: 'synthetic-secret', ownerOpenId: 'ou_owner' }
const event = {
  app_id: 'cli_test',
  sender: { sender_type: 'user', sender_id: { open_id: 'ou_owner' } },
  message: {
    message_id: 'om_input', chat_id: 'oc_private', chat_type: 'p2p',
    message_type: 'text', content: JSON.stringify({ text: '你好' }),
  },
}

describe('Feishu platform boundary', () => {
  it('accepts the real SDK v2 event envelope and ignores delivery-attempt changes', async () => {
    let first
    const dispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': data => { first = normalizeFeishuEvent(data, config) },
    })
    await dispatcher.invoke({
      schema: '2.0',
      header: { app_id: config.appId, event_type: 'im.message.receive_v1', event_id: 'attempt1' },
      event: { sender: event.sender, message: event.message },
    }, { needCheck: false })
    expect(first).toEqual(normalizeFeishuEvent({ ...event, event_id: 'attempt2' }, config))
    expect(first.messageId).toBe('om_input')
    expect(first.text).toBe('你好')
    expect(first).toMatchObject({
      conversation: 'cli_test:oc_private:topic:om_input', replyInThread: true, chatType: 'p2p',
    })
  })

  it.each([
    { ...event, app_id: 'cli_other' },
    { ...event, sender: { sender_type: 'app', sender_id: { open_id: 'ou_owner' } } },
    { ...event, sender: { sender_type: 'user', sender_id: { open_id: 'ou_stranger' } } },
    { ...event, message: { ...event.message, chat_type: 'group' } },
    { ...event, message: { ...event.message, message_type: 'image' } },
    { ...event, message: { ...event.message, content: '{bad json' } },
    { ...event, message: { ...event.message, content: JSON.stringify({ text: 'a'.repeat(13000) }) } },
  ])('drops unauthorized or unsupported input', input => {
    expect(normalizeFeishuEvent(input, config)).toBeUndefined()
  })

  it('accepts explicit Bot mentions from every group by default and scopes topics by root message', () => {
    const groupEvent = {
      ...event,
      sender: { sender_type: 'user', sender_id: { open_id: 'ou_colleague' } },
      message: {
        ...event.message, message_id: 'om_group_input', chat_id: 'oc_group', chat_type: 'group',
        content: JSON.stringify({ text: '@_user_1 帮我总结' }),
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' }, mentioned_type: 'bot', name: 'lumi' }],
      },
    }
    expect(normalizeFeishuEvent(groupEvent, config, 'ou_bot')).toMatchObject({
      sender: 'ou_colleague', text: '帮我总结', conversation: 'cli_test:oc_group:group',
      replyInThread: false, chatType: 'group',
    })
    const thread = {
      ...groupEvent,
      message: {
        ...groupEvent.message, message_id: 'om_reply', root_id: 'om_group_input', thread_id: 'omt_topic',
      },
    }
    expect(normalizeFeishuEvent(thread, config, 'ou_bot')).toMatchObject({
      conversation: 'cli_test:oc_group:topic:om_group_input', replyInThread: true,
    })
    expect(normalizeFeishuEvent(groupEvent, config)).toBeUndefined()
    expect(normalizeFeishuEvent({
      ...groupEvent, message: { ...groupEvent.message, mentions: [] },
    }, config, 'ou_bot')).toBeUndefined()
  })

  it('can explicitly close or restrict group chats', () => {
    const groupEvent = {
      ...event,
      sender: { sender_type: 'user', sender_id: { open_id: 'ou_colleague' } },
      message: {
        ...event.message, message_id: 'om_group_input', chat_id: 'oc_group', chat_type: 'group',
        content: JSON.stringify({ text: '@_user_1 帮我总结' }),
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' }, mentioned_type: 'bot', name: 'lumi' }],
      },
    }
    expect(normalizeFeishuEvent(groupEvent, { ...config, groupChatIds: [] }, 'ou_bot')).toBeUndefined()
    expect(normalizeFeishuEvent(groupEvent, { ...config, groupChatIds: ['*'] }, 'ou_bot'))
      .toMatchObject({ conversation: 'cli_test:oc_group:group' })
    expect(normalizeFeishuEvent(groupEvent, { ...config, groupChatIds: ['oc_group'] }, 'ou_bot'))
      .toMatchObject({ conversation: 'cli_test:oc_group:group' })
    expect(normalizeFeishuEvent({
      ...groupEvent, message: { ...groupEvent.message, chat_id: 'oc_other' },
    }, { ...config, groupChatIds: ['oc_group'] }, 'ou_bot')).toBeUndefined()
  })

  it('binds one reply to the inbound message and requires a business receipt', async () => {
    const reply = vi.fn().mockResolvedValue({ code: 0, data: { message_id: 'om_receipt' } })
    const client = { im: { message: { reply } } }
    const input = normalizeFeishuEvent(event, config)
    expect(await sendFeishuReply(client, input, '答复')).toBe('om_receipt')
    expect(reply.mock.calls[0][0]).toMatchObject({
      path: { message_id: 'om_input' },
      data: {
        msg_type: 'text', content: '{"text":"答复"}', reply_in_thread: true, uuid: expect.any(String),
      },
    })
    reply.mockRejectedValue(new Error('Authorization: secret-token'))
    await expect(sendFeishuReply(client, input, '答复')).rejects.toThrow('no confirmed receipt')
    expect(reply).toHaveBeenCalledTimes(2)
    reply.mockResolvedValue({ code: 999, msg: 'private body' })
    await expect(sendFeishuReply(client, input, '答复')).rejects.not.toThrow('private body')
    reply.mockResolvedValue({ code: 0, data: {} })
    await expect(sendFeishuReply(client, input, '答复')).rejects.toThrow('no confirmed receipt')
  })

  it('fits one platform text message without breaking UTF-8', () => {
    const output = formatReply('🧑你好'.repeat(4000))
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(12000)
    expect(output).toContain('已截断')
    expect(output).not.toContain('\uFFFD')
  })

  it('resolves and validates the current Bot identity without exposing SDK errors', async () => {
    const request = vi.fn().mockResolvedValue({ code: 0, bot: { open_id: 'ou_bot' } })
    await expect(fetchFeishuBotOpenId({ request })).resolves.toBe('ou_bot')
    request.mockResolvedValue({ code: 0, bot: {} })
    await expect(fetchFeishuBotOpenId({ request })).rejects.toThrow('no confirmed result')
    request.mockRejectedValue(new Error('Authorization: private-token'))
    await expect(fetchFeishuBotOpenId({ request })).rejects.not.toThrow('private-token')
  })

  it('validates group chat policy and defaults to all mentioned groups', () => {
    expect(() => validateFeishuConfig({ ...config, groupChatIds: ['oc_group', 'oc_second'] })).not.toThrow()
    expect(() => validateFeishuConfig({ ...config, groupChatIds: [] })).not.toThrow()
    expect(() => validateFeishuConfig({ ...config, groupChatIds: ['*'] })).not.toThrow()
    expect(acceptsAllGroupChats(config)).toBe(true)
    expect(acceptsAllGroupChats({ ...config, groupChatIds: ['*'] })).toBe(true)
    expect(acceptsGroupChat({ ...config, groupChatIds: ['oc_group'] }, 'oc_group')).toBe(true)
    expect(acceptsGroupChat({ ...config, groupChatIds: ['oc_group'] }, 'oc_other')).toBe(false)
    expect(groupChatEnabled(config)).toBe(true)
    expect(groupChatEnabled({ ...config, groupChatIds: [] })).toBe(false)
    for (const groupChatIds of [
      ['oc_group', 'oc_group'], ['oc_invalid!'], ['*', 'oc_group'], 'oc_group', Array(65).fill('oc_group'),
    ]) {
      expect(() => validateFeishuConfig({ ...config, groupChatIds })).toThrow()
    }
  })
})
