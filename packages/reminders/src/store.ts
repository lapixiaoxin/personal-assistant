import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import {
  createId,
  NotificationRecordSchema,
  ReminderRecordSchema,
  type NormalizedReminderCreate,
  type NotificationRecord,
  type NotificationStatus,
  type Principal,
  type ReminderRecord,
  type ReminderStatus,
} from '@lumi/contracts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}

export interface SqliteReminderStoreOptions {
  filename: string
}

export interface ReminderCreateRecordInput {
  now: string
  principal: Principal
  request: NormalizedReminderCreate
  requestDigest: string
}

export interface ReminderStoreListOptions {
  limit?: number
  status?: ReminderStatus
}

export interface NotificationStoreListOptions {
  limit?: number
  status?: NotificationStatus
}

export interface DueProcessingResult {
  fired: ReminderRecord[]
  notifications: NotificationRecord[]
  skipped: ReminderRecord[]
}

interface ReminderRow {
  cancelled_at: string | null
  content: string
  created_at: string
  fire_at: string
  fired_at: string | null
  id: string
  idempotency_key: string
  misfire_policy: string
  next_fire_at: string | null
  notification_id: string | null
  owner_id: string
  principal_id: string
  request_digest: string
  schema_version: string
  skipped_at: string | null
  status: string
  timezone: string
  updated_at: string
}

interface NotificationRow {
  acknowledged_at: string | null
  content: string
  created_at: string
  dedupe_key: string
  id: string
  owner_id: string
  principal_id: string
  reminder_id: string
  schema_version: string
  status: string
}

export class ReminderNotFoundError extends Error {
  constructor(readonly kind: 'notification' | 'reminder', readonly id: string) {
    super(`${kind === 'reminder' ? 'Reminder' : 'Notification'} not found: ${id}`)
    this.name = 'ReminderNotFoundError'
  }
}

export class ReminderConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReminderConflictError'
  }
}

export interface ReminderStore {
  acknowledgeNotification(
    principal: Principal,
    notificationId: string,
    now: string,
  ): NotificationRecord
  cancelReminder(principal: Principal, reminderId: string, now: string): ReminderRecord
  close(): void
  createReminder(input: ReminderCreateRecordInput): ReminderRecord
  getNotification(principal: Principal, notificationId: string): NotificationRecord | undefined
  getReminderByIdempotency(
    principal: Principal,
    idempotencyKey: string,
  ): ReminderRecord | undefined
  getReminder(principal: Principal, reminderId: string): ReminderRecord | undefined
  listNotifications(
    principal: Principal,
    options?: NotificationStoreListOptions,
  ): NotificationRecord[]
  listReminders(principal: Principal, options?: ReminderStoreListOptions): ReminderRecord[]
  nextFireAt(principal: Principal): string | undefined
  processDue(
    principal: Principal,
    now: string,
    mode: 'online' | 'startup',
  ): DueProcessingResult
}

export class SqliteReminderStore implements ReminderStore {
  readonly #db: DatabaseSyncType

  constructor(options: SqliteReminderStoreOptions) {
    if (options.filename !== ':memory:') {
      mkdirSync(dirname(resolve(options.filename)), { recursive: true })
    }
    this.#db = new DatabaseSync(options.filename)
    this.#migrate()
  }

  createReminder(input: ReminderCreateRecordInput): ReminderRecord {
    return this.#transaction(() => {
      const existingRow = this.#db.prepare(`
        SELECT * FROM reminders
        WHERE owner_id = ? AND principal_id = ? AND idempotency_key = ?
      `).get(
        input.principal.ownerId,
        input.principal.id,
        input.request.idempotencyKey,
      ) as ReminderRow | undefined
      if (existingRow) {
        const existing = mapReminder(existingRow)
        if (existing.requestDigest !== input.requestDigest) {
          throw new ReminderConflictError(
            'The idempotency key is already bound to different reminder parameters',
          )
        }
        return existing
      }

      const fireAt = new Date(input.request.fireAt).toISOString()
      const reminder = ReminderRecordSchema.parse({
        cancelledAt: null,
        content: input.request.content,
        createdAt: input.now,
        fireAt,
        firedAt: null,
        id: createId('reminder'),
        idempotencyKey: input.request.idempotencyKey,
        misfirePolicy: input.request.misfirePolicy,
        nextFireAt: fireAt,
        notificationId: null,
        ownerId: input.principal.ownerId,
        principalId: input.principal.id,
        requestDigest: input.requestDigest,
        schemaVersion: 'lumi.reminder/v1',
        skippedAt: null,
        status: 'scheduled',
        timezone: input.request.timezone,
        updatedAt: input.now,
      })
      this.#db.prepare(`
        INSERT INTO reminders (
          id, schema_version, owner_id, principal_id, content, fire_at,
          timezone, misfire_policy, idempotency_key, request_digest, status,
          next_fire_at, notification_id, fired_at, skipped_at, cancelled_at,
          created_at, updated_at
        ) VALUES (
          @id, @schemaVersion, @ownerId, @principalId, @content, @fireAt,
          @timezone, @misfirePolicy, @idempotencyKey, @requestDigest, @status,
          @nextFireAt, @notificationId, @firedAt, @skippedAt, @cancelledAt,
          @createdAt, @updatedAt
        )
      `).run(reminder)
      return reminder
    })
  }

  getReminder(principal: Principal, reminderId: string): ReminderRecord | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM reminders
      WHERE id = ? AND owner_id = ? AND principal_id = ?
    `).get(reminderId, principal.ownerId, principal.id) as ReminderRow | undefined
    return row ? mapReminder(row) : undefined
  }

  getReminderByIdempotency(
    principal: Principal,
    idempotencyKey: string,
  ): ReminderRecord | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM reminders
      WHERE owner_id = ? AND principal_id = ? AND idempotency_key = ?
    `).get(principal.ownerId, principal.id, idempotencyKey) as ReminderRow | undefined
    return row ? mapReminder(row) : undefined
  }

  listReminders(
    principal: Principal,
    options: ReminderStoreListOptions = {},
  ): ReminderRecord[] {
    const clauses = ['owner_id = ?', 'principal_id = ?']
    const values: Array<number | string> = [principal.ownerId, principal.id]
    if (options.status) {
      clauses.push('status = ?')
      values.push(options.status)
    }
    const limit = boundedLimit(options.limit)
    const rows = this.#db.prepare(`
      SELECT * FROM reminders
      WHERE ${clauses.join(' AND ')}
      ORDER BY fire_at DESC, id DESC
      LIMIT ?
    `).all(...values, limit) as unknown as ReminderRow[]
    return rows.map(mapReminder)
  }

  cancelReminder(principal: Principal, reminderId: string, now: string): ReminderRecord {
    return this.#transaction(() => {
      const reminder = this.#requireReminder(principal, reminderId)
      if (reminder.status !== 'scheduled') return reminder
      this.#db.prepare(`
        UPDATE reminders
        SET status = 'cancelled', next_fire_at = NULL, cancelled_at = ?, updated_at = ?
        WHERE id = ? AND status = 'scheduled'
      `).run(now, now, reminder.id)
      return this.#requireReminder(principal, reminder.id)
    })
  }

  getNotification(
    principal: Principal,
    notificationId: string,
  ): NotificationRecord | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM notifications
      WHERE id = ? AND owner_id = ? AND principal_id = ?
    `).get(notificationId, principal.ownerId, principal.id) as NotificationRow | undefined
    return row ? mapNotification(row) : undefined
  }

  listNotifications(
    principal: Principal,
    options: NotificationStoreListOptions = {},
  ): NotificationRecord[] {
    const clauses = ['owner_id = ?', 'principal_id = ?']
    const values: Array<number | string> = [principal.ownerId, principal.id]
    if (options.status) {
      clauses.push('status = ?')
      values.push(options.status)
    }
    const rows = this.#db.prepare(`
      SELECT * FROM notifications
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...values, boundedLimit(options.limit)) as unknown as NotificationRow[]
    return rows.map(mapNotification)
  }

  acknowledgeNotification(
    principal: Principal,
    notificationId: string,
    now: string,
  ): NotificationRecord {
    return this.#transaction(() => {
      const notification = this.#requireNotification(principal, notificationId)
      if (notification.status === 'acknowledged') return notification
      this.#db.prepare(`
        UPDATE notifications
        SET status = 'acknowledged', acknowledged_at = ?
        WHERE id = ? AND status = 'unread'
      `).run(now, notification.id)
      return this.#requireNotification(principal, notification.id)
    })
  }

  nextFireAt(principal: Principal): string | undefined {
    const row = this.#db.prepare(`
      SELECT next_fire_at
      FROM reminders
      WHERE owner_id = ? AND principal_id = ?
        AND status = 'scheduled' AND next_fire_at IS NOT NULL
      ORDER BY next_fire_at ASC, id ASC
      LIMIT 1
    `).get(principal.ownerId, principal.id) as { next_fire_at: string } | undefined
    return row?.next_fire_at
  }

  processDue(
    principal: Principal,
    now: string,
    mode: 'online' | 'startup',
  ): DueProcessingResult {
    return this.#transaction(() => {
      const due = this.#db.prepare(`
        SELECT * FROM reminders
        WHERE owner_id = ? AND principal_id = ?
          AND status = 'scheduled' AND next_fire_at <= ?
        ORDER BY next_fire_at ASC, id ASC
      `).all(principal.ownerId, principal.id, now) as unknown as ReminderRow[]
      const result: DueProcessingResult = {
        fired: [],
        notifications: [],
        skipped: [],
      }
      for (const row of due) {
        const reminder = mapReminder(row)
        if (mode === 'startup' && reminder.misfirePolicy === 'skip') {
          this.#db.prepare(`
            UPDATE reminders
            SET status = 'skipped', next_fire_at = NULL, skipped_at = ?, updated_at = ?
            WHERE id = ? AND status = 'scheduled'
          `).run(now, now, reminder.id)
          result.skipped.push(this.#requireReminder(principal, reminder.id))
          continue
        }

        const dedupeKey = `reminder:${reminder.id}`
        let notification = this.#notificationByDedupe(principal, dedupeKey)
        if (!notification) {
          notification = NotificationRecordSchema.parse({
            acknowledgedAt: null,
            content: reminder.content,
            createdAt: now,
            dedupeKey,
            id: createId('notification'),
            ownerId: reminder.ownerId,
            principalId: reminder.principalId,
            reminderId: reminder.id,
            schemaVersion: 'lumi.notification/v1',
            status: 'unread',
          })
          this.#db.prepare(`
            INSERT OR IGNORE INTO notifications (
              id, schema_version, owner_id, principal_id, reminder_id,
              dedupe_key, content, status, created_at, acknowledged_at
            ) VALUES (
              @id, @schemaVersion, @ownerId, @principalId, @reminderId,
              @dedupeKey, @content, @status, @createdAt, @acknowledgedAt
            )
          `).run(notification)
          notification = this.#notificationByDedupe(principal, dedupeKey)
        }
        if (!notification) {
          throw new ReminderConflictError(
            `Notification could not be persisted for reminder ${reminder.id}`,
          )
        }
        this.#db.prepare(`
          UPDATE reminders
          SET status = 'fired', next_fire_at = NULL, notification_id = ?,
              fired_at = ?, updated_at = ?
          WHERE id = ? AND status = 'scheduled'
        `).run(notification.id, now, now, reminder.id)
        result.notifications.push(notification)
        result.fired.push(this.#requireReminder(principal, reminder.id))
      }
      return result
    })
  }

  close(): void {
    this.#db.close()
  }

  #notificationByDedupe(
    principal: Principal,
    dedupeKey: string,
  ): NotificationRecord | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM notifications
      WHERE owner_id = ? AND principal_id = ? AND dedupe_key = ?
    `).get(principal.ownerId, principal.id, dedupeKey) as NotificationRow | undefined
    return row ? mapNotification(row) : undefined
  }

  #requireReminder(principal: Principal, reminderId: string): ReminderRecord {
    const reminder = this.getReminder(principal, reminderId)
    if (!reminder) throw new ReminderNotFoundError('reminder', reminderId)
    return reminder
  }

  #requireNotification(
    principal: Principal,
    notificationId: string,
  ): NotificationRecord {
    const notification = this.getNotification(principal, notificationId)
    if (!notification) throw new ReminderNotFoundError('notification', notificationId)
    return notification
  }

  #migrate(): void {
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS reminder_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)
    const migration = this.#db.prepare(
      'SELECT version FROM reminder_migrations WHERE version = 1',
    ).get() as { version: number } | undefined
    if (migration) return

    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          content TEXT NOT NULL,
          fire_at TEXT NOT NULL,
          timezone TEXT NOT NULL,
          misfire_policy TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_digest TEXT NOT NULL,
          status TEXT NOT NULL,
          next_fire_at TEXT,
          notification_id TEXT,
          fired_at TEXT,
          skipped_at TEXT,
          cancelled_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_id, principal_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS reminders_due_idx
          ON reminders(owner_id, principal_id, status, next_fire_at);

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          reminder_id TEXT NOT NULL UNIQUE REFERENCES reminders(id),
          dedupe_key TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          acknowledged_at TEXT,
          UNIQUE(owner_id, principal_id, dedupe_key)
        );

        CREATE INDEX IF NOT EXISTS notifications_inbox_idx
          ON notifications(owner_id, principal_id, status, created_at);
      `)
      this.#db.prepare(`
        INSERT OR IGNORE INTO reminder_migrations (version, name, applied_at)
        VALUES (1, 'one-time-reminders', ?)
      `).run(new Date().toISOString())
    })
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.#db.exec('COMMIT')
      return result
    } catch (error) {
      this.#db.exec('ROLLBACK')
      throw error
    }
  }
}

function mapReminder(row: ReminderRow): ReminderRecord {
  return ReminderRecordSchema.parse({
    cancelledAt: row.cancelled_at,
    content: row.content,
    createdAt: row.created_at,
    fireAt: row.fire_at,
    firedAt: row.fired_at,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    misfirePolicy: row.misfire_policy,
    nextFireAt: row.next_fire_at,
    notificationId: row.notification_id,
    ownerId: row.owner_id,
    principalId: row.principal_id,
    requestDigest: row.request_digest,
    schemaVersion: row.schema_version,
    skippedAt: row.skipped_at,
    status: row.status,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  })
}

function mapNotification(row: NotificationRow): NotificationRecord {
  return NotificationRecordSchema.parse({
    acknowledgedAt: row.acknowledged_at,
    content: row.content,
    createdAt: row.created_at,
    dedupeKey: row.dedupe_key,
    id: row.id,
    ownerId: row.owner_id,
    principalId: row.principal_id,
    reminderId: row.reminder_id,
    schemaVersion: row.schema_version,
    status: row.status,
  })
}

function boundedLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 200))
}
