import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import {
  ApprovalRecordSchema,
  AuditRecordSchema,
  createId,
  TaskEventSchema,
  TaskRecordSchema,
  type ApprovalRecord,
  type ApprovalStatus,
  type AuditOutcome,
  type AuditRecord,
  type JsonValue,
  type RiskLevel,
  type TaskEvent,
  type TaskEventType,
  type TaskListQuery,
  type TaskRecord,
  type TaskRequest,
  type TaskState,
} from '@lumi/contracts'

// Keep the specifier intact when bundlers use an older built-in module table.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}

interface SqliteTaskLedgerOptions {
  filename: string
  now?: () => string
}

interface TaskPatch {
  capabilityId?: string | null
  dshSessionId?: string | null
  error?: string | null
  result?: string | null
}

interface AuditInput {
  action: string
  actorId: string
  detail?: Record<string, JsonValue>
  outcome: AuditOutcome
  targetId: string
  targetType?: string
}

interface TaskRow {
  actor_id: string
  capability_id: string | null
  channel: string
  content: string
  context_refs: string
  created_at: string
  dsh_session_id: string | null
  error: string | null
  id: string
  result: string | null
  state: string
  updated_at: string
}

interface EventRow {
  id: string
  occurred_at: string
  payload: string
  sequence: number
  task_id: string
  type: string
}

interface AuditRow {
  action: string
  actor_id: string
  created_at: string
  detail: string
  id: string
  outcome: string
  target_id: string
  target_type: string
}

interface ApprovalRow {
  decided_at: string | null
  decided_by: string | null
  id: string
  reason: string
  requested_at: string
  risk_level: string
  status: string
  task_id: string
}

export class DuplicateTaskError extends Error {
  constructor(readonly taskId: string) {
    super(`Task already exists: ${taskId}`)
    this.name = 'DuplicateTaskError'
  }
}

export class TaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`Task not found: ${taskId}`)
    this.name = 'TaskNotFoundError'
  }
}

export class TaskStateConflictError extends Error {
  constructor(readonly taskId: string, readonly actual: TaskState, readonly expected: readonly TaskState[]) {
    super(`Task ${taskId} is ${actual}; expected ${expected.join(' or ')}`)
    this.name = 'TaskStateConflictError'
  }
}

export interface TaskLedger {
  appendAudit(input: AuditInput): AuditRecord
  appendEvent(taskId: string, type: TaskEventType, payload?: Record<string, JsonValue>): TaskEvent
  close(): void
  createApproval(taskId: string, riskLevel: RiskLevel, reason: string): ApprovalRecord
  createTask(request: TaskRequest): TaskRecord
  getApprovalForTask(taskId: string): ApprovalRecord | undefined
  getTask(taskId: string): TaskRecord | undefined
  listAudit(taskId: string): AuditRecord[]
  listEvents(taskId: string): TaskEvent[]
  listTasks(query?: Partial<TaskListQuery>): TaskRecord[]
  resolveApproval(taskId: string, status: Exclude<ApprovalStatus, 'pending'>, decidedBy: string): ApprovalRecord
  transitionTask(
    taskId: string,
    expected: readonly TaskState[],
    nextState: TaskState,
    patch?: TaskPatch,
  ): TaskRecord
}

export class SqliteTaskLedger implements TaskLedger {
  readonly #db: DatabaseSyncType
  readonly #now: () => string

  constructor(options: SqliteTaskLedgerOptions) {
    if (options.filename !== ':memory:') {
      mkdirSync(dirname(resolve(options.filename)), { recursive: true })
    }
    this.#db = new DatabaseSync(options.filename)
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#migrate()
  }

  createTask(request: TaskRequest): TaskRecord {
    return this.#transaction(() => {
      if (this.getTask(request.id)) {
        throw new DuplicateTaskError(request.id)
      }

      const record: TaskRecord = {
        ...request,
        capabilityId: null,
        dshSessionId: null,
        error: null,
        result: null,
        state: 'queued',
        updatedAt: request.createdAt,
      }
      this.#db.prepare(`
        INSERT INTO tasks (
          id, actor_id, channel, content, context_refs, state, capability_id,
          result, error, dsh_session_id, created_at, updated_at
        ) VALUES (
          @id, @actorId, @channel, @content, @contextRefs, @state, @capabilityId,
          @result, @error, @dshSessionId, @createdAt, @updatedAt
        )
      `).run({
        ...record,
        contextRefs: JSON.stringify(record.contextRefs),
      })
      this.#appendEvent(request.id, 'task.created', { state: 'queued' }, request.createdAt)
      return record
    })
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined
    return row ? mapTask(row) : undefined
  }

  listTasks(query: Partial<TaskListQuery> = {}): TaskRecord[] {
    const clauses: string[] = []
    const values: Array<number | string> = []
    if (query.actorId) {
      clauses.push('actor_id = ?')
      values.push(query.actorId)
    }
    if (query.state) {
      clauses.push('state = ?')
      values.push(query.state)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = query.limit ?? 50
    const rows = this.#db.prepare(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ?`,
    ).all(...values, limit) as unknown as TaskRow[]
    return rows.map(mapTask)
  }

  transitionTask(
    taskId: string,
    expected: readonly TaskState[],
    nextState: TaskState,
    patch: TaskPatch = {},
  ): TaskRecord {
    return this.#transaction(() => {
      const current = this.getTask(taskId)
      if (!current) throw new TaskNotFoundError(taskId)
      if (!expected.includes(current.state)) {
        throw new TaskStateConflictError(taskId, current.state, expected)
      }

      const updated: TaskRecord = {
        ...current,
        ...patch,
        state: nextState,
        updatedAt: this.#now(),
      }
      this.#db.prepare(`
        UPDATE tasks SET
          state = @state,
          capability_id = @capabilityId,
          result = @result,
          error = @error,
          dsh_session_id = @dshSessionId,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        capabilityId: updated.capabilityId,
        dshSessionId: updated.dshSessionId,
        error: updated.error,
        id: updated.id,
        result: updated.result,
        state: updated.state,
        updatedAt: updated.updatedAt,
      })
      this.#appendEvent(taskId, 'task.state_changed', {
        from: current.state,
        to: nextState,
      }, updated.updatedAt)
      return updated
    })
  }

  appendEvent(
    taskId: string,
    type: TaskEventType,
    payload: Record<string, JsonValue> = {},
  ): TaskEvent {
    if (!this.getTask(taskId)) throw new TaskNotFoundError(taskId)
    return this.#transaction(() => this.#appendEvent(taskId, type, payload, this.#now()))
  }

  listEvents(taskId: string): TaskEvent[] {
    const rows = this.#db.prepare(
      'SELECT * FROM task_events WHERE task_id = ? ORDER BY sequence ASC',
    ).all(taskId) as unknown as EventRow[]
    return rows.map(mapEvent)
  }

  appendAudit(input: AuditInput): AuditRecord {
    const record = AuditRecordSchema.parse({
      action: input.action,
      actorId: input.actorId,
      createdAt: this.#now(),
      detail: input.detail ?? {},
      id: createId('audit'),
      outcome: input.outcome,
      targetId: input.targetId,
      targetType: input.targetType ?? 'task',
    })
    this.#db.prepare(`
      INSERT INTO audit_records (
        id, actor_id, action, target_type, target_id, outcome, detail, created_at
      ) VALUES (
        @id, @actorId, @action, @targetType, @targetId, @outcome, @detail, @createdAt
      )
    `).run({ ...record, detail: JSON.stringify(record.detail) })
    return record
  }

  listAudit(taskId: string): AuditRecord[] {
    const rows = this.#db.prepare(
      'SELECT * FROM audit_records WHERE target_id = ? ORDER BY created_at ASC, rowid ASC',
    ).all(taskId) as unknown as AuditRow[]
    return rows.map(mapAudit)
  }

  createApproval(taskId: string, riskLevel: RiskLevel, reason: string): ApprovalRecord {
    const record = ApprovalRecordSchema.parse({
      decidedAt: null,
      decidedBy: null,
      id: createId('approval'),
      reason,
      requestedAt: this.#now(),
      riskLevel,
      status: 'pending',
      taskId,
    })
    this.#db.prepare(`
      INSERT INTO approvals (
        id, task_id, risk_level, reason, status, requested_at, decided_at, decided_by
      ) VALUES (
        @id, @taskId, @riskLevel, @reason, @status, @requestedAt, @decidedAt, @decidedBy
      )
    `).run(record)
    return record
  }

  getApprovalForTask(taskId: string): ApprovalRecord | undefined {
    const row = this.#db.prepare(
      'SELECT * FROM approvals WHERE task_id = ? ORDER BY requested_at DESC LIMIT 1',
    ).get(taskId) as ApprovalRow | undefined
    return row ? mapApproval(row) : undefined
  }

  resolveApproval(
    taskId: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    decidedBy: string,
  ): ApprovalRecord {
    return this.#transaction(() => {
      const current = this.getApprovalForTask(taskId)
      if (!current) throw new Error(`Approval not found for task: ${taskId}`)
      if (current.status !== 'pending') {
        throw new Error(`Approval ${current.id} is already ${current.status}`)
      }
      const decidedAt = this.#now()
      this.#db.prepare(`
        UPDATE approvals
        SET status = ?, decided_at = ?, decided_by = ?
        WHERE id = ? AND status = 'pending'
      `).run(status, decidedAt, decidedBy, current.id)
      return ApprovalRecordSchema.parse({
        ...current,
        decidedAt,
        decidedBy,
        status,
      })
    })
  }

  close(): void {
    this.#db.close()
  }

  #appendEvent(
    taskId: string,
    type: TaskEventType,
    payload: Record<string, JsonValue>,
    occurredAt: string,
  ): TaskEvent {
    const row = this.#db.prepare(
      'SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM task_events WHERE task_id = ?',
    ).get(taskId) as { sequence: number }
    const event = TaskEventSchema.parse({
      id: createId('event'),
      occurredAt,
      payload,
      sequence: row.sequence,
      taskId,
      type,
    })
    this.#db.prepare(`
      INSERT INTO task_events (id, task_id, sequence, type, payload, occurred_at)
      VALUES (@id, @taskId, @sequence, @type, @payload, @occurredAt)
    `).run({ ...event, payload: JSON.stringify(event.payload) })
    return event
  }

  #migrate(): void {
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        content TEXT NOT NULL,
        context_refs TEXT NOT NULL,
        state TEXT NOT NULL,
        capability_id TEXT,
        result TEXT,
        error TEXT,
        dsh_session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        UNIQUE(task_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS task_events_task_idx
        ON task_events(task_id, sequence);

      CREATE TABLE IF NOT EXISTS audit_records (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS audit_target_idx
        ON audit_records(target_id, created_at);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        risk_level TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT
      );

      CREATE INDEX IF NOT EXISTS approvals_task_idx
        ON approvals(task_id, requested_at);

      PRAGMA user_version = 1;
    `)
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

function mapTask(row: TaskRow): TaskRecord {
  return TaskRecordSchema.parse({
    actorId: row.actor_id,
    capabilityId: row.capability_id,
    channel: row.channel,
    content: row.content,
    contextRefs: JSON.parse(row.context_refs),
    createdAt: row.created_at,
    dshSessionId: row.dsh_session_id,
    error: row.error,
    id: row.id,
    result: row.result,
    state: row.state,
    updatedAt: row.updated_at,
  })
}

function mapEvent(row: EventRow): TaskEvent {
  return TaskEventSchema.parse({
    id: row.id,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload),
    sequence: row.sequence,
    taskId: row.task_id,
    type: row.type,
  })
}

function mapAudit(row: AuditRow): AuditRecord {
  return AuditRecordSchema.parse({
    action: row.action,
    actorId: row.actor_id,
    createdAt: row.created_at,
    detail: JSON.parse(row.detail),
    id: row.id,
    outcome: row.outcome,
    targetId: row.target_id,
    targetType: row.target_type,
  })
}

function mapApproval(row: ApprovalRow): ApprovalRecord {
  return ApprovalRecordSchema.parse({
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    id: row.id,
    reason: row.reason,
    requestedAt: row.requested_at,
    riskLevel: row.risk_level,
    status: row.status,
    taskId: row.task_id,
  })
}
