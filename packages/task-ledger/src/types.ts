import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type {
  ActionReceipt,
  ActionRecord,
  ApprovalRecord,
  ApprovalStatus,
  AuditOutcome,
  AuditRecord,
  AuthorizationRecord,
  JsonValue,
  Principal,
  RecoveryDisposition,
  RecoveryReasonCode,
  RecoveryRecord,
  RecoveryResolution,
  RecoveryStatus,
  RiskLevel,
  TaskEvent,
  TaskEventType,
  TaskListQuery,
  TaskRecord,
  TaskRequest,
  TaskState,
  VerificationRecord,
} from '@lumi/contracts'

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

export interface TaskRecoveryInput {
  actionId?: string
  disposition: RecoveryDisposition
  ownerId: string
  principalId: string
  reasonCode: RecoveryReasonCode
  safeToRetry: boolean
  taskId: string
}

export interface RecoveryRetryClaimInput {
  recoveryId: string
  replacementCreatedAt: string
  replacementTaskId: string
}

export interface RecoveryListOptions {
  limit?: number
  status?: RecoveryStatus
  taskId?: string
}

export interface RuntimeRecoveryLease {
  pid: number
  runtimeId: string
  startedAt: string
}

export interface RuntimeRecoveryLeaseClaim extends RuntimeRecoveryLease {
  expectedRuntimeId: string | null
}

export interface TaskPatch {
  capabilityId?: string | null
  dshSessionId?: string | null
  error?: string | null
  result?: string | null
}

export interface AuditInput {
  action: string
  actorId: string
  detail?: Record<string, JsonValue>
  outcome: AuditOutcome
  targetId: string
  targetType?: string
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
  getActionForTask(taskId: string): ActionRecord | undefined
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

export interface RecoveryLedger {
  claimRuntimeRecoveryLease(input: RuntimeRecoveryLeaseClaim): boolean
  claimRecoveryRetry(input: RecoveryRetryClaimInput, principal: Principal): RecoveryRecord
  getRecovery(recoveryId: string, principal: Principal): RecoveryRecord | undefined
  getRecoveryForTask(taskId: string, principal: Principal): RecoveryRecord | undefined
  listRecoveries(principal: Principal, options?: RecoveryListOptions): RecoveryRecord[]
  listTasksForRecovery(principalId: string): TaskRecord[]
  getRuntimeRecoveryLease(): RuntimeRecoveryLease | undefined
  recordTaskRecovery(input: TaskRecoveryInput): RecoveryRecord
  releaseRecoveryRetry(recoveryId: string, principal: Principal): RecoveryRecord
  releaseRuntimeRecoveryLease(runtimeId: string): void
  resolveRecovery(
    recoveryId: string,
    principal: Principal,
    resolution: RecoveryResolution,
  ): RecoveryRecord
}

export interface TaskRow {
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

export interface EventRow {
  id: string
  occurred_at: string
  payload: string
  sequence: number
  task_id: string
  type: string
}

export interface AuditRow {
  action: string
  actor_id: string
  created_at: string
  detail: string
  id: string
  outcome: string
  target_id: string
  target_type: string
}

export interface ApprovalRow {
  decided_at: string | null
  decided_by: string | null
  id: string
  reason: string
  requested_at: string
  risk_level: string
  status: string
  task_id: string
}

export interface ActionRow {
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

export interface AuthorizationRow {
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

export interface ReceiptRow {
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

export interface VerificationRow {
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

export interface RecoveryRow {
  action_id: string | null
  detected_at: string
  disposition: string
  id: string
  owner_id: string
  principal_id: string
  reason_code: string
  replacement_created_at: string | null
  replacement_task_id: string | null
  resolution: string | null
  resolved_at: string | null
  safe_to_retry: number
  schema_version: string
  status: string
  task_id: string
}

export interface RuntimeRecoveryLeaseRow {
  pid: number
  runtime_id: string
  started_at: string
}

export type RunInTransaction = <T>(operation: () => T) => T
export type SqliteDatabase = DatabaseSyncType
