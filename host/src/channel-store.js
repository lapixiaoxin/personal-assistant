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
    chmodSync(path, 0o600)
    this.token = randomUUID()
    this.closed = false
    try {
      this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL')
      const version = this.db.prepare('PRAGMA user_version').get().user_version
      if (version !== 0 && version !== 1) throw new Error('Unsupported channel database version')
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
        PRAGMA user_version = 1;
      `)
      this.transaction(() => {
        const previous = this.db.prepare('SELECT * FROM owner WHERE singleton = 1').get()
        if (previous && (previous.identity !== identity || previous.host !== hostname())) {
          throw new Error('Channel database belongs to another identity or host')
        }
        if (previous?.pid && isAlive(previous.pid)) {
          throw new Error('Channel database already has a live owner')
        }
        this.db.prepare(`INSERT INTO owner VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(singleton) DO UPDATE SET pid = excluded.pid, token = excluded.token`)
          .run(identity, hostname(), process.pid, this.token)
        this.db.prepare(`UPDATE inbox SET state = CASE state
          WHEN 'running' THEN 'interrupted' ELSE 'unknown' END, updated_at = ?
          WHERE state IN ('running', 'sending')`).run(new Date().toISOString())
      })
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  accept(envelope) {
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
      if (count >= 100 && envelope.text !== '/cancel') throw new Error('Channel inbox is full')
      const now = new Date().toISOString()
      this.db.prepare(`INSERT INTO inbox
        (id, digest, chat, envelope, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'queued', ?, ?)`)
        .run(envelope.id, digest, envelope.chat, encoded, now, now)
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

  conversation(chat, reset = false) {
    const existing = this.db.prepare('SELECT session FROM conversations WHERE chat = ?').get(chat)
    if (existing && !reset) return { session: existing.session, fresh: false }
    const session = `lumi-${randomUUID()}`
    this.db.prepare(`INSERT INTO conversations VALUES (?, ?)
      ON CONFLICT(chat) DO UPDATE SET session = excluded.session`).run(chat, session)
    return { session, fresh: true }
  }

  session(chat) {
    return this.db.prepare('SELECT session FROM conversations WHERE chat = ?').get(chat)?.session
  }

  cancelQueued(chat, exceptId) {
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
