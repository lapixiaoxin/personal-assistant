import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
const envelope = {
  id: 'app:om_one', chat: 'app:oc_one', conversation: 'app:oc_one:topic:om_one',
  messageId: 'om_one', sender: 'owner', text: 'hi',
}

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
    const conversation = store.conversation(envelope.conversation)
    store.close()
    const reopened = new ChannelStore(path, 'test-owner')
    stores.push(reopened)
    expect(reopened.records().map(row => row.state)).toEqual([
      'interrupted', 'unknown', 'ready', 'queued',
    ])
    expect(reopened.next().reply).toBe('not sent yet')
    expect(reopened.conversation(envelope.conversation)).toEqual({ ...conversation, fresh: false })
    expect(() => reopened.transition('two', 'ready', 'sending')).toThrow('unexpectedly')
  })

  it('does not modify a database from a newer version', () => {
    const { path, store } = fixture()
    store.close()
    const db = new DatabaseSync(path)
    db.exec('PRAGMA user_version = 99')
    db.close()
    const before = readFileSync(path)
    expect(() => new ChannelStore(path, 'test-owner')).toThrow('Unsupported')
    expect(readFileSync(path)).toEqual(before)
  })

  it('migrates a v1 inbox without changing receipts or session mappings', () => {
    const { path, store } = fixture()
    store.accept(envelope)
    store.transition(envelope.id, 'queued', 'running')
    store.transition(envelope.id, 'running', 'ready', 'previous answer')
    store.transition(envelope.id, 'ready', 'sending')
    store.transition(envelope.id, 'sending', 'sent', null, 'om_previous')
    const mapping = store.conversation(envelope.conversation)
    store.close()
    const db = new DatabaseSync(path)
    db.exec('DROP TABLE stream_deliveries; ALTER TABLE inbox DROP COLUMN conversation; PRAGMA user_version = 1')
    db.close()
    const migrated = new ChannelStore(path, 'test-owner')
    stores.push(migrated)
    expect(migrated.db.prepare('PRAGMA user_version').get().user_version).toBe(4)
    expect(migrated.records()).toEqual([{ id: envelope.id, state: 'sent', receipt: 'om_previous' }])
    expect(migrated.conversation(envelope.conversation)).toEqual({ ...mapping, fresh: false })
    expect(migrated.streams(envelope.id)).toEqual([])
  })

  it('migrates v3 inbox scopes to their legacy chat value without changing receipts', () => {
    const { path, store } = fixture()
    store.accept(envelope)
    store.transition(envelope.id, 'queued', 'running')
    store.transition(envelope.id, 'running', 'ready', 'previous answer')
    store.transition(envelope.id, 'ready', 'sending')
    store.transition(envelope.id, 'sending', 'sent', null, 'om_previous')
    store.close()
    const db = new DatabaseSync(path)
    db.exec('ALTER TABLE inbox DROP COLUMN conversation; PRAGMA user_version = 3')
    db.close()
    const migrated = new ChannelStore(path, 'test-owner')
    stores.push(migrated)
    expect(migrated.db.prepare('PRAGMA user_version').get().user_version).toBe(4)
    expect(migrated.db.prepare('SELECT conversation FROM inbox WHERE id = ?').get(envelope.id).conversation)
      .toBe(envelope.chat)
    expect(migrated.records()).toEqual([{ id: envelope.id, state: 'sent', receipt: 'om_previous' }])
  })
})
