import { createHash } from 'node:crypto'
import {
  ActionReceiptSchema,
  ActionRecordSchema,
  ApprovalRecordSchema,
  AuditRecordSchema,
  AuthorizationRecordSchema,
  RecoveryRecordSchema,
  TaskEventSchema,
  TaskRecordSchema,
  VerificationRecordSchema,
  type ActionReceipt,
  type ActionRecord,
  type ApprovalRecord,
  type AuditRecord,
  type AuthorizationRecord,
  type JsonValue,
  type RecoveryRecord,
  type TaskEvent,
  type TaskRecord,
  type VerificationRecord,
} from '@lumi/contracts'
import type {
  ActionRow,
  ApprovalRow,
  AuditRow,
  AuthorizationRow,
  EventRow,
  ReceiptRow,
  RecoveryRow,
  TaskRow,
  VerificationRow,
} from './types.ts'

export function mapTask(row: TaskRow): TaskRecord {
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

export function mapEvent(row: EventRow): TaskEvent {
  return TaskEventSchema.parse({
    id: row.id,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload),
    sequence: row.sequence,
    taskId: row.task_id,
    type: row.type,
  })
}

export function mapAudit(row: AuditRow): AuditRecord {
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

export function mapApproval(row: ApprovalRow): ApprovalRecord {
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

export function mapAction(row: ActionRow): ActionRecord {
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

export function mapAuthorization(row: AuthorizationRow): AuthorizationRecord {
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

export function mapReceipt(row: ReceiptRow): ActionReceipt {
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

export function mapVerification(row: VerificationRow): VerificationRecord {
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

export function mapRecovery(row: RecoveryRow): RecoveryRecord {
  return RecoveryRecordSchema.parse({
    actionId: row.action_id,
    detectedAt: row.detected_at,
    disposition: row.disposition,
    id: row.id,
    ownerId: row.owner_id,
    principalId: row.principal_id,
    reasonCode: row.reason_code,
    replacementCreatedAt: row.replacement_created_at,
    replacementTaskId: row.replacement_task_id,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    safeToRetry: row.safe_to_retry === 1,
    schemaVersion: row.schema_version,
    status: row.status,
    taskId: row.task_id,
  })
}

export function computeActionDigest(action: ActionRecord, inputDigest: string): string {
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

export function digest(content: string): string {
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
