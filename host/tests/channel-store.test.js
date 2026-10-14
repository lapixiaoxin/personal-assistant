import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ChannelStore } from '../src/channel-store.js'

const dirs = []
const stores = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'lumi-channel-store-'))
  dirs.push(dir)
  const path = join(dir, 'channels.db')
  const store = new ChannelStore(path, 'test-owner')
  stores.push(store)
  return { path, store }
}
const envelope = { id: 'app:om_one', chat: 'app:oc_one', messageId: 'om_one', sender: 'owner', text: 'hi' }

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('durable channel receipts', () => {
  it('deduplicates, rejects conflicting identities and excludes another live owner', () => {
    const { path, store } = fixture()
    expect(store.accept(envelope)).toBe(true)
    expect(store.accept(envelope)).toBe(false)
    expect(() => store.accept({ ...envelope, text: 'changed' })).toThrow('Conflicting')
    expect(() => new ChannelStore(path, 'test-owner')).toThrow('live owner')
    expect(() => new ChannelStore(path, 'another-owner')).toThrow('another identity')
    expect(store.records()).toHaveLength(1)
  })

  it('recovers queued work but never replays interrupted work or ambiguous sends', () => {
    const { path, store } = fixture()
    for (const id of ['one', 'two', 'three', 'four']) store.accept({ ...envelope, id })
    store.transition('one', 'queued', 'running')
    store.transition('two', 'queued', 'running')
    store.transition('two', 'running', 'ready', 'persisted answer')
    store.transition('two', 'ready', 'sending')
    store.transition('three', 'queued', 'running')
    store.transition('three', 'running', 'ready', 'not sent yet')
    const conversation = store.conversation(envelope.chat)
    store.close()
    const reopened = new ChannelStore(path, 'test-owner')
    stores.push(reopened)
    expect(reopened.records().map(row => row.state)).toEqual([
      'interrupted', 'unknown', 'ready', 'queued',
    ])
    expect(reopened.next().reply).toBe('not sent yet')
    expect(reopened.conversation(envelope.chat)).toEqual({ ...conversation, fresh: false })
    expect(() => reopened.transition('two', 'ready', 'sending')).toThrow('unexpectedly')
  })

  it('does not modify a database from a newer version', () => {
    const { path, store } = fixture()
    store.close()
    const db = new DatabaseSync(path)
    db.exec('PRAGMA user_version = 99')
    db.close()
    expect(() => new ChannelStore(path, 'test-owner')).toThrow('Unsupported')
  })
})
