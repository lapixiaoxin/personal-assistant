import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelStore } from '../src/channel-store.js'
import { StreamReply } from '../src/stream-reply.js'

const dirs = []
const stores = []
const envelope = {
  id: 'input', chat: 'app:oc_chat', conversation: 'app:oc_chat:topic:om_input',
  messageId: 'om_input', text: 'hi',
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'lumi-progress-'))
  dirs.push(dir)
  const path = join(dir, 'channels.db')
  const store = new ChannelStore(path, 'test')
  stores.push(store)
  store.accept(envelope)
  store.transition(envelope.id, 'queued', 'running')
  const progress = {
    start: vi.fn(async () => {
      expect(store.streams(envelope.id)[0].state).toBe('sending')
      return { id: 'cot_progress', receipt: 'om_progress' }
    }),
    append: vi.fn(async (row, events, timestamp) => {
      expect(events.length).toBeGreaterThan(0)
      expect(store.streams(envelope.id)[0].update_pending).toBe(1)
      expect(timestamp).toBeLessThanOrEqual(row.sequence)
    }),
    complete: vi.fn(async () => {}),
  }
  const port = {
    progress, intervalMs: 1,
    create: vi.fn(async () => 'card_answer'),
    send: vi.fn(async () => 'om_answer'),
    write: vi.fn(async () => {}), close: vi.fn(async () => {}), replace: vi.fn(async () => {}),
  }
  return { path, store, port, stream: new StreamReply(store, port, envelope.id) }
}

describe('durable native progress', () => {
  it('confirms both receipts, projects only real public tool status and keeps all timestamps increasing', async () => {
    const { store, port, stream } = fixture()
    await stream.start(envelope)
    const progress = stream.progress
    const call = { type: 'tool/call', data: {
      callId: 'real-call', name: 'untrusted-secret-name',
      get arguments() { throw new Error('must not read') },
    } }
    progress.event(call)
    progress.event(call)
    progress.event({ type: 'tool/result', data: { message: {
      toolCallId: 'real-call', isError: true,
      get content() { throw new Error('must not read') },
    } } })
    stream.frame({ type: 'start', attemptId: 'a', revision: 1 })
    stream.frame({ type: 'chunk', attemptId: 'a', revision: 2, index: 0,
      chunk: { type: 'reasoning-delta', get text() { throw new Error('must not read') } } })
    store.streamTerminal(envelope.id, 'done', 'final', 'done')
    expect(await stream.finish()).toBe(true)
    const events = port.progress.append.mock.calls.flatMap(call => call[1])
    expect(events.filter(event => event.kind === 'tool_started')).toHaveLength(1)
    expect(events.find(event => event.kind === 'tool_finished').failed).toBe(true)
    expect(JSON.stringify(events)).not.toContain('untrusted-secret-name')
    expect(events.at(-1)).toEqual({ kind: 'finished', status: 'done' })
    const calls = port.progress.append.mock.calls
    for (let i = 1; i < calls.length; i++) expect(calls[i][2]).toBeGreaterThan(calls[i - 1][0].sequence)
    expect(port.create).toHaveBeenCalledExactlyOnceWith('answer')
    expect(port.send).toHaveBeenCalledTimes(1)
    expect(port.replace.mock.calls[0][2]).toBe('final')
    expect(store.streamStatus()).toEqual([])
  })

  it('never replays an unknown native send or creates an answer after it', async () => {
    const { store, port, stream } = fixture()
    port.progress.start.mockRejectedValue(new Error('lost'))
    await expect(stream.start(envelope)).rejects.toThrow('unknown delivery')
    store.streamTerminal(envelope.id, 'failed', 'failed')
    expect(await stream.finish()).toBe(false)
    expect(port.create).not.toHaveBeenCalled()
    expect(port.progress.start).toHaveBeenCalledTimes(1)
    expect(store.streams(envelope.id).map(row => row.state)).toEqual(['unknown', 'planned'])
  })

  it('preserves ambiguous append evidence, completes the answer and resumes only Complete after restart', async () => {
    const { path, store, port, stream } = fixture()
    await stream.start(envelope)
    port.progress.append.mockRejectedValue(new Error('unknown append'))
    port.progress.complete.mockRejectedValueOnce(new Error('unknown completion'))
    store.streamTerminal(envelope.id, 'done', 'final', 'done')
    expect(await stream.finish()).toBe(false)
    expect(store.streams(envelope.id)[1].finished).toBe(1)
    const count = port.progress.append.mock.calls.length
    store.close()
    const reopened = new ChannelStore(path, 'test')
    stores.push(reopened)
    // Replace only the assertion fixture's append (no append should occur after restart).
    port.progress.append.mockClear()
    expect(await new StreamReply(reopened, port, envelope.id).finish()).toBe(true)
    expect(port.progress.append).not.toHaveBeenCalled()
    expect(count).toBe(2)
    expect(port.progress.start).toHaveBeenCalledTimes(1)
    expect(reopened.streamStatus()[0]).toMatchObject({
      event_uncertain: 1, terminal_event: 'unknown', finished: 1,
    })
  })

  it('caps event queues and reserves a terminal event even after hitting the budget', async () => {
    const { store, port, stream } = fixture()
    await stream.start(envelope)
    for (let n = 0; n < 1000; n++) stream.progress.stage(`stage-${n}`)
    expect(stream.progress.pending.length).toBeLessThanOrEqual(100)
    expect(stream.progress.blocked).toBe(true)
    store.streamTerminal(envelope.id, 'stopped', 'cancelled', 'interrupted')
    expect(await stream.finish()).toBe(true)
    expect(port.progress.append.mock.calls.at(-1)[1]).toEqual([{ kind: 'finished', status: 'interrupted' }])
    expect(store.streams(envelope.id)[0].event_count).toBeLessThan(1000)
    expect(store.streamStatus()[0].event_uncertain).toBe(1)
  })

  it('migrates v2 cards without changing IDs, sequences or receipts', async () => {
    const { path, store, port } = fixture()
    const cardPort = { ...port, progress: undefined }
    await new StreamReply(store, cardPort, envelope.id).start(envelope)
    store.streamSequence(envelope.id, 'progress')
    const before = store.streams(envelope.id)
    store.close()
    const db = new DatabaseSync(path)
    for (const column of ['kind', 'cot_id', 'event_count', 'event_uncertain', 'terminal_event', 'terminal_status']) {
      db.exec(`ALTER TABLE stream_deliveries DROP COLUMN ${column}`)
    }
    db.exec('ALTER TABLE inbox DROP COLUMN conversation')
    db.exec('PRAGMA user_version = 2')
    db.close()
    const reopened = new ChannelStore(path, 'test')
    stores.push(reopened)
    expect(reopened.streams(envelope.id)).toEqual(before)
    expect(reopened.db.prepare('PRAGMA user_version').get().user_version).toBe(4)
  })
})
