import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import {
  ActionReceiptSchema,
  ActionRecordSchema,
  ApprovalRecordSchema,
  AuditRecordSchema,
  AuthorizationRecordSchema,
  createId,
  TaskEventSchema,
  TaskRecordSchema,
  VerificationRecordSchema,
  type ActionReceipt,
  type ActionRecord,
  type ActionStatus,
  type ApprovalRecord,
  type ApprovalStatus,
  type AuditOutcome,
  type AuditRecord,
  type AuthorizationRecord,
  type JsonValue,
  type Principal,
  type RiskLevel,
  type TaskEvent,
  type TaskEventType,
  type TaskListQuery,
  type TaskRecord,
  type TaskRequest,
  type TaskState,
  type VerificationRecord,
} from '@lumi/contracts'

// Keep the specifier intact when bundlers use an older built-in module table.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}

export interface SqliteTaskLedgerOptions {
  filename: string
  now?: () => string
}

export interface ActionPreparationInput {
  action: ActionRecord
  content: string
  task: TaskRequest
}

export interface ActionReceiptInput {
  actionId: string
  artifactRef: string
  contentDigest: string
  providerVersion: string
  recovered?: boolean
}

export interface VerificationInput {
  actionId: string
  evidenceRefs: string[]
  expectedDigest: string
  observedDigest: string | null
  reason: string
  status: VerificationRecord['status']
  verifierVersion: string
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

interface ActionRow {
  action_digest: string
  authorization_id: string | null
  cancellation_requested_at: string | null
  capability: string
  created_at: string
  deadline: string | null
  effect: string
  id: string
  idempotency_key: string
  input_digest: string
  input_ref: string
  operation: string
  owner_id: string
  principal_id: string
  receipt_id: string | null
  revocation_epoch: number
  schema_version: string
  status: string
  target: string
  task_id: string
  updated_at: string
  verification_id: string | null
}

interface AuthorizationRow {
  action_digest: string
  action_id: string
  capability_version: string
  created_at: string
  expires_at: string
  id: string
  max_uses: number
  owner_id: string
  policy_version: string
  principal_id: string
  remaining_uses: number
  revocation_epoch: number
  schema_version: string
  status: string
  updated_at: string
}

interface ReceiptRow {
  action_id: string
  artifact_ref: string
  content_digest: string
  created_at: string
  id: string
  provider_version: string
  recovered: number
  schema_version: string
  status: string
}

interface VerificationRow {
  action_id: string
  created_at: string
  evidence_refs: string
  expected_digest: string
  id: string
  observed_digest: string | null
  reason: string
  schema_version: string
  status: string
  task_id: string
  verifier_version: string
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

export class ActionConflictError extends Error {
  constructor(readonly actionId: string, message: string) {
    super(message)
    this.name = 'ActionConflictError'
  }
}

export class ActionNotFoundError extends Error {
  constructor(readonly actionId: string) {
    super(`Action not found: ${actionId}`)
    this.name = 'ActionNotFoundError'
  }
}

export class ActionStateConflictError extends Error {
  constructor(
    readonly actionId: string,
    readonly actual: ActionStatus,
    readonly expected: readonly ActionStatus[],
  ) {
    super(`Action ${actionId} is ${actual}; expected ${expected.join(' or ')}`)
    this.name = 'ActionStateConflictError'
  }
}

export class ActionAuthorizationError extends Error {
  constructor(
    readonly code: 'APPROVAL_EXPIRED' | 'APPROVAL_REQUIRED' | 'CANCELLED' | 'PERMISSION_DENIED',
    message: string,
  ) {
    super(message)
    this.name = 'ActionAuthorizationError'
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

export interface ActionLedger {
  authorizeAction(
    actionId: string,
    principal: Principal,
    expiresAt: string,
    policyVersion: string,
  ): AuthorizationRecord
  cancelAction(actionId: string, principal: Principal): ActionRecord
  claimActionExecution(actionId: string, principal: Principal): ActionRecord
  getAction(actionId: string): ActionRecord | undefined
  getActionContent(actionId: string): string
  getAuthorizationForAction(actionId: string): AuthorizationRecord | undefined
  getReceiptForAction(actionId: string): ActionReceipt | undefined
  getVerificationForAction(actionId: string): VerificationRecord | undefined
  listActions(ownerId: string, limit?: number): ActionRecord[]
  markActionOutcomeUnknown(actionId: string): ActionRecord
  prepareAction(input: ActionPreparationInput): ActionRecord
  recordActionSucceeded(input: ActionReceiptInput): ActionReceipt
  recordVerification(input: VerificationInput): VerificationRecord
}

export class SqliteTaskLedger implements TaskLedger, ActionLedger {
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
    return this.#transaction(() => this.#createTask(request))
  }

  prepareAction(input: ActionPreparationInput): ActionRecord {
    return this.#transaction(() => {
      const existing = this.#db.prepare(`
        SELECT * FROM actions
        WHERE owner_id = ? AND operation = ? AND idempotency_key = ?
      `).get(
        input.action.ownerId,
        input.action.operation,
        input.action.idempotencyKey,
      ) as ActionRow | undefined
      if (existing) {
        const action = mapAction(existing)
        if (action.actionDigest !== input.action.actionDigest) {
          throw new ActionConflictError(
            action.id,
            'The idempotency key is already bound to different action parameters',
          )
        }
        return action
      }

      this.#createTask(input.task)
      this.#db.prepare(`
        INSERT INTO actions (
          id, task_id, schema_version, owner_id, principal_id, operation, target,
          input_digest, input_ref, action_digest, capability, effect, idempotency_key,
          deadline, status, authorization_id, receipt_id, verification_id,
          cancellation_requested_at, revocation_epoch, created_at, updated_at
        ) VALUES (
          @id, @taskId, @schemaVersion, @ownerId, @principalId, @operation, @target,
          @inputDigest, @inputRef, @actionDigest, @capability, @effect, @idempotencyKey,
          @deadline, @status, @authorizationId, @receiptId, @verificationId,
          @cancellationRequestedAt, @revocationEpoch, @createdAt, @updatedAt
        )
      `).run({
        ...input.action,
        capability: JSON.stringify(input.action.capability),
        target: JSON.stringify(input.action.target),
      })
      this.#db.prepare(`
        INSERT INTO action_inputs (action_id, content)
        VALUES (?, ?)
      `).run(input.action.id, input.content)
      this.#transitionTask(input.task.id, ['queued'], 'waiting_approval', {
        capabilityId: input.action.capability.id,
      })
      this.#appendEvent(input.task.id, 'action.prepared', {
        actionDigest: input.action.actionDigest,
        actionId: input.action.id,
        capabilityVersion: input.action.capability.version,
        effect: input.action.effect,
        target: input.action.target,
      }, input.action.createdAt)
      return input.action
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
    return this.#transaction(() => this.#transitionTask(taskId, expected, nextState, patch))
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

  getAction(actionId: string): ActionRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM actions WHERE id = ?').get(actionId) as
      | ActionRow
      | undefined
    return row ? mapAction(row) : undefined
  }

  listActions(ownerId: string, limit = 50): ActionRecord[] {
    const rows = this.#db.prepare(`
      SELECT * FROM actions
      WHERE owner_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(ownerId, limit) as unknown as ActionRow[]
    return rows.map(mapAction)
  }

  getActionContent(actionId: string): string {
    const row = this.#db.prepare(
      'SELECT content FROM action_inputs WHERE action_id = ?',
    ).get(actionId) as { content: string } | undefined
    if (!row) throw new ActionNotFoundError(actionId)
    return row.content
  }

  getAuthorizationForAction(actionId: string): AuthorizationRecord | undefined {
    const row = this.#db.prepare(
      'SELECT * FROM authorizations WHERE action_id = ?',
    ).get(actionId) as AuthorizationRow | undefined
    return row ? mapAuthorization(row) : undefined
  }

  getReceiptForAction(actionId: string): ActionReceipt | undefined {
    const row = this.#db.prepare(
      'SELECT * FROM action_receipts WHERE action_id = ?',
    ).get(actionId) as ReceiptRow | undefined
    return row ? mapReceipt(row) : undefined
  }

  getVerificationForAction(actionId: string): VerificationRecord | undefined {
    const row = this.#db.prepare(
      'SELECT * FROM verifications WHERE action_id = ?',
    ).get(actionId) as VerificationRow | undefined
    return row ? mapVerification(row) : undefined
  }

  authorizeAction(
    actionId: string,
    principal: Principal,
    expiresAt: string,
    policyVersion: string,
  ): AuthorizationRecord {
    return this.#transaction(() => {
      const action = this.#requireAction(actionId)
      this.#assertActionPrincipal(action, principal)
      const existing = this.getAuthorizationForAction(actionId)
      if (existing && action.status === 'authorized') return existing
      if (action.status === 'cancelled') {
        throw new ActionAuthorizationError('CANCELLED', 'The action has been cancelled')
      }
      if (action.status !== 'prepared') {
        throw new ActionStateConflictError(actionId, action.status, ['prepared'])
      }
      const now = this.#now()
      if (Date.parse(expiresAt) <= Date.parse(now)) {
        throw new ActionAuthorizationError('APPROVAL_EXPIRED', 'Authorization already expired')
      }
      if (action.deadline && Date.parse(expiresAt) > Date.parse(action.deadline)) {
        throw new ActionAuthorizationError(
          'APPROVAL_EXPIRED',
          'Authorization cannot outlive the action deadline',
        )
      }
      const authorization = AuthorizationRecordSchema.parse({
        actionDigest: action.actionDigest,
        actionId,
        capabilityVersion: action.capability.version,
        createdAt: now,
        expiresAt,
        id: createId('authorization'),
        maxUses: 1,
        ownerId: action.ownerId,
        policyVersion,
        principalId: action.principalId,
        remainingUses: 1,
        revocationEpoch: action.revocationEpoch,
        schemaVersion: 'lumi.authorization/v1',
        status: 'active',
        updatedAt: now,
      })
      this.#db.prepare(`
        INSERT INTO authorizations (
          id, action_id, schema_version, action_digest, owner_id, principal_id,
          capability_version, max_uses, remaining_uses, expires_at, revocation_epoch,
          policy_version, status, created_at, updated_at
        ) VALUES (
          @id, @actionId, @schemaVersion, @actionDigest, @ownerId, @principalId,
          @capabilityVersion, @maxUses, @remainingUses, @expiresAt, @revocationEpoch,
          @policyVersion, @status, @createdAt, @updatedAt
        )
      `).run(authorization)
      this.#db.prepare(`
        UPDATE actions
        SET status = 'authorized', authorization_id = ?, updated_at = ?
        WHERE id = ? AND status = 'prepared'
      `).run(authorization.id, now, actionId)
      this.#transitionTask(action.taskId, ['waiting_approval'], 'queued')
      this.#appendEvent(action.taskId, 'action.authorized', {
        actionDigest: action.actionDigest,
        actionId,
        authorizationId: authorization.id,
        expiresAt,
      }, now)
      return authorization
    })
  }

  claimActionExecution(actionId: string, principal: Principal): ActionRecord {
    return this.#transaction(() => {
      const action = this.#requireAction(actionId)
      this.#assertActionPrincipal(action, principal)
      if (action.cancellationRequestedAt) {
        throw new ActionAuthorizationError('CANCELLED', 'Cancellation was requested')
      }
      if (action.status !== 'authorized') {
        throw new ActionStateConflictError(actionId, action.status, ['authorized'])
      }
      const authorization = this.getAuthorizationForAction(actionId)
      if (!authorization) {
        throw new ActionAuthorizationError('APPROVAL_REQUIRED', 'Authorization is missing')
      }
      const content = this.getActionContent(actionId)
      const persistedInputDigest = digest(content)
      const persistedActionDigest = computeActionDigest(action, persistedInputDigest)
      const now = this.#now()
      if (
        authorization.status !== 'active'
        || authorization.remainingUses !== 1
        || authorization.actionDigest !== action.actionDigest
        || action.inputDigest !== persistedInputDigest
        || action.actionDigest !== persistedActionDigest
        || authorization.capabilityVersion !== action.capability.version
        || authorization.revocationEpoch !== action.revocationEpoch
      ) {
        throw new ActionAuthorizationError(
          'APPROVAL_REQUIRED',
          'Authorization is no longer valid for this action',
        )
      }
      if (
        Date.parse(authorization.expiresAt) <= Date.parse(now)
        || (action.deadline && Date.parse(action.deadline) <= Date.parse(now))
      ) {
        throw new ActionAuthorizationError('APPROVAL_EXPIRED', 'Authorization has expired')
      }
      const authorizationResult = this.#db.prepare(`
        UPDATE authorizations
        SET remaining_uses = 0, status = 'consumed', updated_at = ?
        WHERE id = ? AND status = 'active' AND remaining_uses = 1
      `).run(now, authorization.id)
      if (Number(authorizationResult.changes) !== 1) {
        throw new ActionAuthorizationError(
          'APPROVAL_REQUIRED',
          'Authorization was consumed concurrently',
        )
      }
      const actionResult = this.#db.prepare(`
        UPDATE actions
        SET status = 'executing', updated_at = ?
        WHERE id = ? AND status = 'authorized'
      `).run(now, actionId)
      if (Number(actionResult.changes) !== 1) {
        throw new ActionStateConflictError(actionId, this.#requireAction(actionId).status, ['authorized'])
      }
      this.#transitionTask(action.taskId, ['queued'], 'running', { error: null })
      this.#appendEvent(action.taskId, 'action.executing', {
        actionId,
        authorizationId: authorization.id,
      }, now)
      return this.#requireAction(actionId)
    })
  }

  cancelAction(actionId: string, principal: Principal): ActionRecord {
    return this.#transaction(() => {
      const action = this.#requireAction(actionId)
      this.#assertActionPrincipal(action, principal)
      if (action.status === 'cancelled' || action.cancellationRequestedAt) return action
      const now = this.#now()
      const nextEpoch = action.revocationEpoch + 1
      this.#db.prepare(`
        UPDATE authorizations
        SET status = 'revoked', updated_at = ?
        WHERE action_id = ? AND status = 'active'
      `).run(now, actionId)

      if (action.status === 'prepared' || action.status === 'authorized') {
        this.#db.prepare(`
          UPDATE actions
          SET status = 'cancelled', cancellation_requested_at = ?,
              revocation_epoch = ?, updated_at = ?
          WHERE id = ?
        `).run(now, nextEpoch, now, actionId)
        const task = this.getTask(action.taskId)
        if (task && (task.state === 'waiting_approval' || task.state === 'queued')) {
          this.#transitionTask(action.taskId, [task.state], 'cancelled', {
            error: 'Cancelled before action execution',
          })
        }
        this.#appendEvent(action.taskId, 'action.cancelled', {
          actionId,
          preventedExecution: true,
        }, now)
      } else {
        this.#db.prepare(`
          UPDATE actions
          SET cancellation_requested_at = ?, revocation_epoch = ?, updated_at = ?
          WHERE id = ?
        `).run(now, nextEpoch, now, actionId)
        this.#appendEvent(action.taskId, 'action.cancel_requested', {
          actionId,
          effectMayRemain: true,
          statusAtCancellation: action.status,
        }, now)
      }
      return this.#requireAction(actionId)
    })
  }

  recordActionSucceeded(input: ActionReceiptInput): ActionReceipt {
    return this.#transaction(() => {
      const existing = this.getReceiptForAction(input.actionId)
      if (existing) return existing
      const action = this.#requireAction(input.actionId)
      if (action.status !== 'executing' && action.status !== 'outcome_unknown') {
        throw new ActionStateConflictError(
          action.id,
          action.status,
          ['executing', 'outcome_unknown'],
        )
      }
      const now = this.#now()
      const receipt = ActionReceiptSchema.parse({
        actionId: action.id,
        artifactRef: input.artifactRef,
        contentDigest: input.contentDigest,
        createdAt: now,
        id: createId('receipt'),
        providerVersion: input.providerVersion,
        recovered: input.recovered ?? false,
        schemaVersion: 'lumi.action-receipt/v1',
        status: 'succeeded',
      })
      this.#db.prepare(`
        INSERT INTO action_receipts (
          id, action_id, schema_version, status, artifact_ref, content_digest,
          provider_version, recovered, created_at
        ) VALUES (
          @id, @actionId, @schemaVersion, @status, @artifactRef, @contentDigest,
          @providerVersion, @recovered, @createdAt
        )
      `).run({ ...receipt, recovered: receipt.recovered ? 1 : 0 })
      this.#db.prepare(`
        UPDATE actions
        SET status = 'succeeded', receipt_id = ?, updated_at = ?
        WHERE id = ?
      `).run(receipt.id, now, action.id)
      this.#appendEvent(action.taskId, 'action.succeeded', {
        actionId: action.id,
        artifactRef: receipt.artifactRef,
        contentDigest: receipt.contentDigest,
        receiptId: receipt.id,
        recovered: receipt.recovered,
      }, now)
      return receipt
    })
  }

  markActionOutcomeUnknown(actionId: string): ActionRecord {
    return this.#transaction(() => {
      const action = this.#requireAction(actionId)
      if (action.status === 'outcome_unknown') return action
      if (action.status !== 'executing') {
        throw new ActionStateConflictError(actionId, action.status, ['executing'])
      }
      const now = this.#now()
      this.#db.prepare(`
        UPDATE actions
        SET status = 'outcome_unknown', updated_at = ?
        WHERE id = ?
      `).run(now, actionId)
      this.#appendEvent(action.taskId, 'action.outcome_unknown', {
        actionId,
        safeToRetry: false,
      }, now)
      return this.#requireAction(actionId)
    })
  }

  recordVerification(input: VerificationInput): VerificationRecord {
    return this.#transaction(() => {
      const existing = this.getVerificationForAction(input.actionId)
      if (existing) return existing
      const action = this.#requireAction(input.actionId)
      if (input.status === 'passed' && action.status !== 'succeeded') {
        throw new ActionStateConflictError(action.id, action.status, ['succeeded'])
      }
      const now = this.#now()
      const verification = VerificationRecordSchema.parse({
        ...input,
        createdAt: now,
        id: createId('verification'),
        schemaVersion: 'lumi.verification/v1',
        taskId: action.taskId,
      })
      this.#db.prepare(`
        INSERT INTO verifications (
          id, action_id, task_id, schema_version, verifier_version, status,
          expected_digest, observed_digest, evidence_refs, reason, created_at
        ) VALUES (
          @id, @actionId, @taskId, @schemaVersion, @verifierVersion, @status,
          @expectedDigest, @observedDigest, @evidenceRefs, @reason, @createdAt
        )
      `).run({
        ...verification,
        evidenceRefs: JSON.stringify(verification.evidenceRefs),
      })
      this.#db.prepare(`
        UPDATE actions
        SET verification_id = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        verification.id,
        verification.status === 'passed' ? action.status : 'failed',
        now,
        action.id,
      )
      this.#appendEvent(action.taskId, 'verification.completed', {
        actionId: action.id,
        reason: verification.reason,
        status: verification.status,
        verificationId: verification.id,
      }, now)
      const task = this.getTask(action.taskId)
      if (task?.state === 'running') {
        this.#transitionTask(
          action.taskId,
          ['running'],
          verification.status === 'passed' ? 'completed' : 'failed',
          verification.status === 'passed'
            ? { error: null, result: `Verified artifact action ${action.id}` }
            : { error: verification.reason },
        )
      }
      return verification
    })
  }

  close(): void {
    this.#db.close()
  }

  #createTask(request: TaskRequest): TaskRecord {
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
  }

  #transitionTask(
    taskId: string,
    expected: readonly TaskState[],
    nextState: TaskState,
    patch: TaskPatch = {},
  ): TaskRecord {
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
  }

  #requireAction(actionId: string): ActionRecord {
    const action = this.getAction(actionId)
    if (!action) throw new ActionNotFoundError(actionId)
    return action
  }

  #assertActionPrincipal(action: ActionRecord, principal: Principal): void {
    if (action.ownerId !== principal.ownerId || action.principalId !== principal.id) {
      throw new ActionAuthorizationError(
        'PERMISSION_DENIED',
        'The action belongs to another principal',
      )
    }
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
      PRAGMA busy_timeout = 5000;
    `)
    const versionRow = this.#db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (versionRow.user_version > 2) {
      throw new Error(`Database schema version ${versionRow.user_version} is newer than supported version 2`)
    }
    if (versionRow.user_version < 1) {
      this.#transaction(() => {
        this.#db.exec(`
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
      })
    }
    if (versionRow.user_version < 2) {
      this.#transaction(() => {
        this.#db.exec(`
          CREATE TABLE IF NOT EXISTS migration_history (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS actions (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
            schema_version TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            principal_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            target TEXT NOT NULL,
            input_digest TEXT NOT NULL,
            input_ref TEXT NOT NULL,
            action_digest TEXT NOT NULL,
            capability TEXT NOT NULL,
            effect TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            deadline TEXT,
            status TEXT NOT NULL,
            authorization_id TEXT,
            receipt_id TEXT,
            verification_id TEXT,
            cancellation_requested_at TEXT,
            revocation_epoch INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(owner_id, operation, idempotency_key)
          );

          CREATE INDEX IF NOT EXISTS actions_owner_idx
            ON actions(owner_id, created_at);

          CREATE TABLE IF NOT EXISTS action_inputs (
            action_id TEXT PRIMARY KEY REFERENCES actions(id),
            content TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS authorizations (
            id TEXT PRIMARY KEY,
            action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
            schema_version TEXT NOT NULL,
            action_digest TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            principal_id TEXT NOT NULL,
            capability_version TEXT NOT NULL,
            max_uses INTEGER NOT NULL,
            remaining_uses INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            revocation_epoch INTEGER NOT NULL,
            policy_version TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS action_receipts (
            id TEXT PRIMARY KEY,
            action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
            schema_version TEXT NOT NULL,
            status TEXT NOT NULL,
            artifact_ref TEXT NOT NULL,
            content_digest TEXT NOT NULL,
            provider_version TEXT NOT NULL,
            recovered INTEGER NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS verifications (
            id TEXT PRIMARY KEY,
            action_id TEXT NOT NULL UNIQUE REFERENCES actions(id),
            task_id TEXT NOT NULL REFERENCES tasks(id),
            schema_version TEXT NOT NULL,
            verifier_version TEXT NOT NULL,
            status TEXT NOT NULL,
            expected_digest TEXT NOT NULL,
            observed_digest TEXT,
            evidence_refs TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
          );

          PRAGMA user_version = 2;
        `)
        const appliedAt = this.#now()
        this.#db.prepare(`
          INSERT OR IGNORE INTO migration_history (version, name, applied_at)
          VALUES (1, 'initial-task-ledger', ?)
        `).run(appliedAt)
        this.#db.prepare(`
          INSERT OR IGNORE INTO migration_history (version, name, applied_at)
          VALUES (2, 'action-boundary', ?)
        `).run(appliedAt)
      })
    }
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

function mapAction(row: ActionRow): ActionRecord {
  return ActionRecordSchema.parse({
    actionDigest: row.action_digest,
    authorizationId: row.authorization_id,
    cancellationRequestedAt: row.cancellation_requested_at,
    capability: JSON.parse(row.capability),
    createdAt: row.created_at,
    deadline: row.deadline,
    effect: row.effect,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    inputDigest: row.input_digest,
    inputRef: row.input_ref,
    operation: row.operation,
    ownerId: row.owner_id,
    principalId: row.principal_id,
    receiptId: row.receipt_id,
    revocationEpoch: row.revocation_epoch,
    schemaVersion: row.schema_version,
    status: row.status,
    target: JSON.parse(row.target),
    taskId: row.task_id,
    updatedAt: row.updated_at,
    verificationId: row.verification_id,
  })
}

function mapAuthorization(row: AuthorizationRow): AuthorizationRecord {
  return AuthorizationRecordSchema.parse({
    actionDigest: row.action_digest,
    actionId: row.action_id,
    capabilityVersion: row.capability_version,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    maxUses: row.max_uses,
    ownerId: row.owner_id,
    policyVersion: row.policy_version,
    principalId: row.principal_id,
    remainingUses: row.remaining_uses,
    revocationEpoch: row.revocation_epoch,
    schemaVersion: row.schema_version,
    status: row.status,
    updatedAt: row.updated_at,
  })
}

function mapReceipt(row: ReceiptRow): ActionReceipt {
  return ActionReceiptSchema.parse({
    actionId: row.action_id,
    artifactRef: row.artifact_ref,
    contentDigest: row.content_digest,
    createdAt: row.created_at,
    id: row.id,
    providerVersion: row.provider_version,
    recovered: row.recovered === 1,
    schemaVersion: row.schema_version,
    status: row.status,
  })
}

function mapVerification(row: VerificationRow): VerificationRecord {
  return VerificationRecordSchema.parse({
    actionId: row.action_id,
    createdAt: row.created_at,
    evidenceRefs: JSON.parse(row.evidence_refs),
    expectedDigest: row.expected_digest,
    id: row.id,
    observedDigest: row.observed_digest,
    reason: row.reason,
    schemaVersion: row.schema_version,
    status: row.status,
    taskId: row.task_id,
    verifierVersion: row.verifier_version,
  })
}

function computeActionDigest(action: ActionRecord, inputDigest: string): string {
  return digest(JSON.stringify(sortJson({
    capability: action.capability,
    deadline: action.deadline,
    effect: action.effect,
    idempotencyKey: action.idempotencyKey,
    inputDigest,
    operation: action.operation,
    ownerId: action.ownerId,
    principalId: action.principalId,
    target: action.target,
  })))
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, sortJson(child)]),
    )
  }
  return value
}
