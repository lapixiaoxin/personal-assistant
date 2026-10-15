import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Transport receipts only. DSH owns the transcript and agent execution.
 * One local process owns this database; it must never be shared across hosts.
 */
export class ChannelStore {
  constructor(path, identity) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.token = randomUUID()
    this.closed = false
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version
      if (![0, 1, 2, 3, 4].includes(version)) throw new Error('Unsupported channel database version')
      chmodSync(path, 0o600)
      this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL')
      this.transaction(() => {
        this.db.exec(`
        CREATE TABLE IF NOT EXISTS owner (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          identity TEXT NOT NULL, host TEXT NOT NULL, pid INTEGER, token TEXT
        );
        CREATE TABLE IF NOT EXISTS conversations (
          chat TEXT PRIMARY KEY, session TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inbox (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT UNIQUE NOT NULL, digest TEXT NOT NULL,
          chat TEXT NOT NULL, envelope TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN
            ('queued','running','ready','sending','sent','interrupted','unknown')),
          reply TEXT, receipt TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
      `)
        const previous = this.db.prepare('SELECT * FROM owner WHERE singleton = 1').get()
        if (previous && (previous.identity !== identity || previous.host !== hostname())) {
          throw new Error('Channel database belongs to another identity or host')
        }
        if (previous?.pid && isAlive(previous.pid)) {
          throw new Error('Channel database already has a live owner')
        }
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS stream_deliveries (
            inbox_id TEXT NOT NULL, part TEXT NOT NULL CHECK(part IN ('progress','answer')),
            state TEXT NOT NULL CHECK(state IN ('planned','created','sending','delivered','unknown')),
            card_id TEXT, receipt TEXT,
            sequence INTEGER NOT NULL DEFAULT 0,
            update_pending INTEGER NOT NULL DEFAULT 0,
            update_failed INTEGER NOT NULL DEFAULT 0,
            terminal_text TEXT, finished INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(inbox_id, part)
          );
        `)
        if (version < 3) this.db.exec(`
          ALTER TABLE stream_deliveries ADD COLUMN kind TEXT NOT NULL DEFAULT 'card';
          ALTER TABLE stream_deliveries ADD COLUMN cot_id TEXT;
          ALTER TABLE stream_deliveries ADD COLUMN event_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE stream_deliveries ADD COLUMN event_uncertain INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE stream_deliveries ADD COLUMN terminal_event TEXT NOT NULL DEFAULT 'planned';
          ALTER TABLE stream_deliveries ADD COLUMN terminal_status TEXT NOT NULL DEFAULT 'error';
          PRAGMA user_version = 3;
        `)
        if (version < 4) this.db.exec(`
          ALTER TABLE inbox ADD COLUMN conversation TEXT NOT NULL DEFAULT '';
          UPDATE inbox SET conversation = chat WHERE conversation = '';
          PRAGMA user_version = 4;
        `)
        this.db.prepare(`INSERT INTO owner VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(singleton) DO UPDATE SET pid = excluded.pid, token = excluded.token`)
          .run(identity, hostname(), process.pid, this.token)
        this.db.prepare(`UPDATE inbox SET state = CASE state
          WHEN 'running' THEN 'interrupted' ELSE 'unknown' END, updated_at = ?
          WHERE state IN ('running', 'sending')`).run(new Date().toISOString())
        this.db.exec("UPDATE stream_deliveries SET state = 'unknown' WHERE state = 'sending'")
        this.db.exec(`UPDATE stream_deliveries SET event_uncertain = 1
          WHERE kind = 'cot' AND update_pending = 1`)
      })
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  accept(envelope) {
    if (typeof envelope?.conversation !== 'string' || !envelope.conversation
      || Buffer.byteLength(envelope.conversation, 'utf8') > 512) {
      throw new Error('Channel envelope requires a bounded conversation scope')
    }
    const encoded = JSON.stringify(envelope)
    const digest = createHash('sha256').update(encoded).digest('hex')
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT digest FROM inbox WHERE id = ?').get(envelope.id)
      if (previous) {
        if (previous.digest !== digest) throw new Error('Conflicting platform message identity')
        return false
      }
      const count = this.db.prepare(
        "SELECT count(*) AS n FROM inbox WHERE state IN ('queued','running','ready','sending')",
      ).get().n
      if (count >= 100 && !['/cancel', '/stop'].includes(envelope.text)) {
        throw new Error('Channel inbox is full')
      }
      const now = new Date().toISOString()
      this.db.prepare(`INSERT INTO inbox
        (id, digest, chat, conversation, envelope, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .run(envelope.id, digest, envelope.chat, envelope.conversation, encoded, now, now)
      return true
    })
  }

  next() {
    const row = this.db.prepare(
      "SELECT * FROM inbox WHERE state IN ('queued', 'ready') ORDER BY seq LIMIT 1",
    ).get()
    return row ? { ...row, envelope: JSON.parse(row.envelope) } : undefined
  }

  transition(id, from, to, reply = null, receipt = null) {
    const result = this.db.prepare(`UPDATE inbox SET state = ?,
      reply = coalesce(?, reply), receipt = coalesce(?, receipt), updated_at = ?
      WHERE id = ? AND state = ?`)
      .run(to, reply, receipt, new Date().toISOString(), id, from)
    if (result.changes !== 1) throw new Error('Channel state changed unexpectedly')
  }

  conversation(scope, reset = false) {
    const existing = this.db.prepare('SELECT session FROM conversations WHERE chat = ?').get(scope)
    if (existing && !reset) return { session: existing.session, fresh: false }
    const session = `lumi-${randomUUID()}`
    this.db.prepare(`INSERT INTO conversations VALUES (?, ?)
      ON CONFLICT(chat) DO UPDATE SET session = excluded.session`).run(scope, session)
    return { session, fresh: true }
  }

  session(scope) {
    return this.db.prepare('SELECT session FROM conversations WHERE chat = ?').get(scope)?.session
  }

  cancelQueued(conversation, exceptId) {
    this.db.prepare(`UPDATE inbox SET state = 'ready', reply = '该请求已取消，未提交给 DSH。',
      updated_at = ? WHERE conversation = ? AND state = 'queued' AND id != ?`)
      .run(new Date().toISOString(), conversation, exceptId)
  }

  cancelQueuedChat(chat, exceptId) {
    this.db.prepare(`UPDATE inbox SET state = 'ready', reply = '该请求已取消，未提交给 DSH。',
      updated_at = ? WHERE chat = ? AND state = 'queued' AND id != ?`)
      .run(new Date().toISOString(), chat, exceptId)
  }

  status() {
    return this.db.prepare('SELECT state, count(*) AS count FROM inbox GROUP BY state').all()
  }

  records() {
    return this.db.prepare('SELECT id, state, receipt FROM inbox ORDER BY seq').all()
  }

  envelopes() {
    return this.db.prepare('SELECT id, chat, conversation FROM inbox ORDER BY seq').all()
  }

  planStream(id, nativeProgress = false) {
    this.transaction(() => {
      for (const part of ['progress', 'answer']) {
        this.db.prepare(`INSERT INTO stream_deliveries (inbox_id, part, state, kind)
          VALUES (?, ?, 'planned', ?)`).run(id, part, nativeProgress && part === 'progress' ? 'cot' : 'card')
      }
    })
  }

  streams(id) {
    return this.db.prepare('SELECT * FROM stream_deliveries WHERE inbox_id = ? ORDER BY part DESC').all(id)
  }

  streamTransition(id, part, from, to, cardId = null, receipt = null, cotId = null) {
    const result = this.db.prepare(`UPDATE stream_deliveries SET state = ?,
      card_id = coalesce(?, card_id), receipt = coalesce(?, receipt), cot_id = coalesce(?, cot_id)
      WHERE inbox_id = ? AND part = ? AND state = ?`).run(to, cardId, receipt, cotId, id, part, from)
    if (result.changes !== 1) throw new Error('Stream delivery state changed unexpectedly')
  }

  streamSequence(id, part) {
    return this.db.prepare(`UPDATE stream_deliveries SET sequence = sequence + 1,
      update_pending = 1 WHERE inbox_id = ? AND part = ? AND state = 'delivered'
      RETURNING sequence`).get(id, part).sequence
  }

  streamUpdated(id, part, success, finished = false) {
    this.db.prepare(`UPDATE stream_deliveries SET update_pending = 0, update_failed = ?,
      finished = ? WHERE inbox_id = ? AND part = ?`).run(success ? 0 : 1, finished ? 1 : 0, id, part)
  }

  streamTerminal(id, progress, answer, status = 'error') {
    this.transaction(() => {
      for (const [part, text] of [['progress', progress], ['answer', answer]]) {
        this.db.prepare(`UPDATE stream_deliveries SET terminal_text = ?, terminal_status = ?
          WHERE inbox_id = ? AND part = ?`).run(text, status, id, part)
      }
    })
  }

  progressReserve(id, count, terminal = false) {
    if (!Number.isInteger(count) || count < 1 || count > 48) throw new Error('Invalid event budget')
    const row = this.db.prepare(`UPDATE stream_deliveries
      SET sequence = max(sequence + 1, ?) + ? - 1, event_count = event_count + ?,
      update_pending = 1, terminal_event = CASE WHEN ? THEN 'sending' ELSE terminal_event END
      WHERE inbox_id = ? AND part = 'progress' AND kind = 'cot' AND state = 'delivered'
      AND event_count + ? <= 999 AND (? = 0 OR terminal_event = 'planned')
      RETURNING sequence`).get(Date.now(), count, count, terminal ? 1 : 0, id, count, terminal ? 1 : 0)
    if (!row) throw new Error('Progress event reservation failed')
    return row.sequence - count + 1
  }

  progressAppended(id, success, terminal = false) {
    this.db.prepare(`UPDATE stream_deliveries SET update_pending = 0,
      event_uncertain = max(event_uncertain, ?),
      terminal_event = CASE WHEN ? THEN ? ELSE terminal_event END
      WHERE inbox_id = ? AND part = 'progress'`)
      .run(success ? 0 : 1, terminal ? 1 : 0, success ? 'confirmed' : 'unknown', id)
  }

  progressIncomplete(id) {
    this.db.prepare(`UPDATE stream_deliveries SET event_uncertain = 1
      WHERE inbox_id = ? AND part = 'progress' AND kind = 'cot'`).run(id)
  }

  streamRecovery() {
    return this.db.prepare(`SELECT inbox.* FROM inbox WHERE state IN ('interrupted','unknown')
      AND EXISTS (SELECT 1 FROM stream_deliveries WHERE inbox_id = inbox.id
        AND state = 'delivered') ORDER BY seq`).all()
      .map(row => ({ ...row, envelope: JSON.parse(row.envelope) }))
  }

  streamStatus() {
    return this.db.prepare(`SELECT inbox_id, part, state, kind, card_id, cot_id, receipt, sequence,
      update_pending, update_failed, finished, event_uncertain, terminal_event FROM stream_deliveries
      WHERE state = 'unknown' OR (state = 'delivered' AND finished = 0) OR event_uncertain = 1`).all()
  }

  transaction(operation) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.db.prepare('UPDATE owner SET pid = NULL, token = NULL WHERE token = ?').run(this.token)
    this.db.close()
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}
