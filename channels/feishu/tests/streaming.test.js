import { describe, expect, it, vi } from 'vitest'
import { validateFeishuConfig } from '../src/index.js'
import { createFeishuStreaming, replyCard } from '../src/streaming.js'

function fixture() {
  const create = vi.fn().mockResolvedValue({ code: 0, data: { card_id: 'card_test' } })
  const reply = vi.fn().mockResolvedValue({ code: 0, data: { message_id: 'om_receipt' } })
  const content = vi.fn().mockResolvedValue({ code: 0 })
  const settings = vi.fn().mockResolvedValue({ code: 0 })
  const update = vi.fn().mockResolvedValue({ code: 0 })
  const port = createFeishuStreaming({
    cardkit: { v1: { card: { create, settings, update }, cardElement: { content } } },
    im: { message: { reply } },
  })
  return { port, create, reply, content, settings, update }
}

describe('Feishu streaming card protocol', () => {
  it('uses two distinct stable reply identities and a collapsed progress panel', async () => {
    const { port, create, reply } = fixture()
    const envelope = { id: 'cli_test:om_input', messageId: 'om_input' }
    await port.create('progress')
    const card = JSON.parse(create.mock.calls[0][0].data.data)
    expect(card.schema).toBe('2.0')
    expect(card.config.streaming_mode).toBe(true)
    expect(card.config.width_mode).toBe('compact')
    expect(card.body.padding).toBe('8px')
    expect(card.body.elements[0]).toMatchObject({
      tag: 'collapsible_panel', expanded: false, padding: '0px',
      header: {
        width: 'auto_when_fold', padding: '0px', icon_position: 'follow_text',
        icon_expanded_angle: -180,
        icon: { tag: 'standard_icon', token: 'down-small-ccm_outlined' },
      },
      elements: [{ tag: 'markdown', element_id: 'stream_body' }],
    })
    expect(replyCard('progress', '已结束', false).body.elements[0].header)
      .toEqual(card.body.elements[0].header)
    await port.send(envelope, 'progress', 'card_one')
    await port.send(envelope, 'answer', 'card_two')
    await port.send(envelope, 'progress', 'card_one')
    expect(reply.mock.calls[0][0]).toMatchObject({
      path: { message_id: 'om_input' }, data: { msg_type: 'interactive' },
    })
    expect(JSON.parse(reply.mock.calls[0][0].data.content)).toEqual({
      type: 'card', data: { card_id: 'card_one' },
    })
    expect(reply.mock.calls[0][0].data.uuid).not.toBe(reply.mock.calls[1][0].data.uuid)
    expect(reply.mock.calls[0][0].data.uuid).toBe(reply.mock.calls[2][0].data.uuid)
  })

  it('requires business success and valid identities without revealing SDK errors', async () => {
    const { port, create, reply, content, settings, update } = fixture()
    create.mockResolvedValue({ code: 0, data: {} })
    await expect(port.create('answer')).rejects.toThrow('no confirmed identity')
    reply.mockResolvedValue({ code: 0, data: { message_id: '' } })
    await expect(port.send({ id: 'input' }, 'answer', 'card')).rejects.toThrow('no confirmed receipt')
    for (const [method, invoke] of [
      [content, () => port.write('card', 'partial', 1)],
      [settings, () => port.close('card', 'answer', 2)],
      [update, () => port.replace('card', 'answer', 'final', 3)],
    ]) {
      method.mockResolvedValue({ code: 999, msg: 'private error' })
      await expect(invoke()).rejects.toThrow('no confirmed result')
      method.mockRejectedValue(new Error('Authorization: private-token'))
      await expect(invoke()).rejects.not.toThrow('private-token')
    }
  })

  it('closes streaming before a terminal full replacement with increasing sequence', async () => {
    const { port, content, settings, update } = fixture()
    await port.write('card', '累计正文', 1)
    await port.close('card', 'answer', 2)
    await port.replace('card', 'answer', '最终正文', 3)
    expect(content.mock.calls[0][0]).toMatchObject({
      path: { card_id: 'card', element_id: 'stream_body' },
      data: { content: '累计正文', sequence: 1 },
    })
    expect(JSON.parse(settings.mock.calls[0][0].data.settings).config.streaming_mode).toBe(false)
    const card = JSON.parse(update.mock.calls[0][0].data.card.data)
    expect(card.config.streaming_mode).toBe(false)
    expect(card.body.elements[0].content).toBe('最终正文')
    expect(update.mock.calls[0][0].data.sequence).toBe(3)
  })

  it.each(['🧑你好', '\\\n"', '\u0000'])('caps escaped requests without splitting Unicode: %j', unit => {
    const card = replyCard('answer', unit.repeat(20000), false)
    const request = { card: { type: 'card_json', data: JSON.stringify(card) }, sequence: 1 }
    expect(Buffer.byteLength(JSON.stringify(request), 'utf8')).toBeLessThan(30000)
    expect(card.body.elements[0].content).toContain('已截断')
    expect(card.body.elements[0].content).not.toContain('\uFFFD')
  })

  it('keeps text mode compatible and rejects unknown reply modes', () => {
    const config = { appId: 'cli_test', appSecret: 'synthetic-secret', ownerOpenId: 'ou_owner' }
    expect(validateFeishuConfig(config)).toBe(config)
    expect(() => validateFeishuConfig({ ...config, replyMode: 'streaming-cards' })).not.toThrow()
    expect(() => validateFeishuConfig({ ...config, replyMode: 'invalid' })).toThrow()
  })
})
