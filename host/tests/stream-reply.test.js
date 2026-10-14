import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelHost } from '../src/channel-host.js'
import { ChannelStore } from '../src/channel-store.js'
import { StreamReply } from '../src/stream-reply.js'

const stores = []
const dirs = []
const envelope = { id: 'input', chat: 'chat', messageId: 'om_input', text: 'hi' }
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture(intervalMs = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'lumi-stream-'))
  dirs.push(dir)
  const path = join(dir, 'channels.db')
  const store = new ChannelStore(path, 'test')
  stores.push(store)
  store.accept(envelope)
  store.transition(envelope.id, 'queued', 'running')
  const calls = []
  let cardCount = 0
  const operation = name => vi.fn(async (cardId, ...args) => {
    const part = store.streams(envelope.id).find(row => row.card_id === cardId)
    calls.push({ name, cardId, args, at: Date.now(), reserved: part.sequence })
  })
  const port = {
    intervalMs,
    create: vi.fn(async () => `card_${++cardCount}`),
    send: vi.fn(async (input, part) => `${input.messageId}_${part}`),
    write: operation('write'), close: operation('close'), replace: operation('replace'),
  }
  return { path, store, port, calls, stream: new StreamReply(store, port, envelope.id) }
}

describe('durable streaming delivery', () => {
  it('coalesces cumulative text, serializes and reserves sequence before each update', async () => {
    const { stream, store, port, calls } = fixture(25)
    await stream.start(envelope)
    for (let n = 1; n <= 50; n++) stream.text('answer', 'a'.repeat(n))
    await expect.poll(() => calls.length).toBe(1)
    expect(calls[0].args[0]).toBe('a'.repeat(50))
    store.streamTerminal(envelope.id, 'done', 'final')
    expect(await stream.finish()).toBe(true)
    expect(port.send).toHaveBeenCalledTimes(2)
    expect(port.write).toHaveBeenCalledTimes(1)
    for (const call of calls) expect(call.args.at(-1)).toBe(call.reserved)
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(24)
    }
    expect(store.streams(envelope.id).every(row => row.finished === 1)).toBe(true)
  })

  it('never reads reasoning text, ignores duplicate frames and replaces abandoned attempts', async () => {
    const { stream } = fixture()
    const frame = chunk => ({ type: 'chunk', attemptId: 'a', revision: 2, index: 0, chunk })
    stream.frame({ type: 'start', attemptId: 'a', revision: 1 })
    stream.frame(frame({ type: 'reasoning-delta', get text() { throw new Error('must not read') } }))
    stream.frame({ ...frame({ type: 'text-delta', index: 1, text: 'public' }), revision: 3, index: 1 })
    stream.frame({ ...frame({ type: 'text-delta', index: 1, text: 'duplicate' }), revision: 3, index: 1 })
    stream.frame({ ...frame({ type: 'text-delta', index: 1, text: 'wrong' }),
      attemptId: 'other', revision: 99, index: 2 })
    expect(stream.desired.get('answer')).toBe('public')
    stream.frame({ type: 'end', attemptId: 'a', revision: 4, outcome: { kind: 'abandoned' } })
    expect(stream.desired.get('answer')).not.toContain('public')
    stream.frame({ type: 'start', attemptId: 'b', revision: 5 })
    stream.frame({
      type: 'chunk', attemptId: 'b', revision: 6, index: 0,
      chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'replacement' } },
    })
    expect(stream.desired.get('answer')).toBe('replacement')
    await stream.stop()
  })

  it('stops after an ambiguous first send and never sends the second card', async () => {
    const { stream, store, port } = fixture()
    port.send.mockRejectedValue(new Error('network lost'))
    await expect(stream.start(envelope)).rejects.toThrow('unknown delivery')
    expect(port.create).toHaveBeenCalledTimes(1)
    expect(port.send).toHaveBeenCalledTimes(1)
    expect(store.streams(envelope.id).map(row => row.state)).toEqual(['unknown', 'planned'])
    store.streamTerminal(envelope.id, 'failed', 'failed')
    expect(await stream.finish()).toBe(false)
    expect(port.send).toHaveBeenCalledTimes(1)
  })

  it('allows a terminal overwrite after incremental loss, retains terminal failure for recovery', async () => {
    const { stream, store, port } = fixture()
    await stream.start(envelope)
    port.write.mockRejectedValue(new Error('incremental result unknown'))
    stream.text('answer', 'partial')
    await expect.poll(() => stream.blocked).toBe(true)
    stream.text('answer', 'should not update')
    store.streamTerminal(envelope.id, 'done', 'authoritative final')
    port.replace.mockRejectedValueOnce(new Error('terminal unknown'))
    expect(await stream.finish()).toBe(false)
    expect(port.write).toHaveBeenCalledTimes(1)
    expect(store.streamStatus()).toHaveLength(1)
    expect(await new StreamReply(store, port, envelope.id).finish()).toBe(true)
    expect(port.send).toHaveBeenCalledTimes(2)
    expect(store.streamStatus()).toEqual([])
  })

  it('classifies a crashed send and pending update without resetting sequences', async () => {
    const { path, store } = fixture()
    store.planStream(envelope.id)
    store.streamTransition(envelope.id, 'progress', 'planned', 'created', 'card_known')
    store.streamTransition(envelope.id, 'progress', 'created', 'sending')
    store.streamTransition(envelope.id, 'progress', 'sending', 'delivered', null, 'om_known')
    const sequence = store.streamSequence(envelope.id, 'progress')
    store.streamTransition(envelope.id, 'answer', 'planned', 'created', 'card_ambiguous')
    store.streamTransition(envelope.id, 'answer', 'created', 'sending')
    store.close()
    const reopened = new ChannelStore(path, 'test')
    stores.push(reopened)
    expect(reopened.records()[0].state).toBe('interrupted')
    expect(reopened.streams(envelope.id).map(row => row.state)).toEqual(['delivered', 'unknown'])
    expect(reopened.streamSequence(envelope.id, 'progress')).toBe(sequence + 1)
    expect(reopened.streamRecovery()).toHaveLength(1)
    expect(reopened.next()).toBeUndefined()
  })

  it('reconciles a crash after both terminal acknowledgements without another API call', async () => {
    const { path, store, stream, port, calls } = fixture()
    await stream.start(envelope)
    store.streamTerminal(envelope.id, 'done', 'final')
    store.transition(envelope.id, 'running', 'ready', 'final')
    store.transition(envelope.id, 'ready', 'sending')
    expect(await stream.finish()).toBe(true)
    const operationCount = calls.length
    store.close()
    const reopened = new ChannelStore(path, 'test')
    stores.push(reopened)
    expect(reopened.records()[0].state).toBe('unknown')
    const host = new ChannelHost({}, reopened, { recoveryStreaming: port }, {})
    await host.drain()
    expect(reopened.records()[0].state).toBe('sent')
    expect(calls).toHaveLength(operationCount)
    expect(port.send).toHaveBeenCalledTimes(2)
  })
})
