import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const TaskStateSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
])
export type TaskState = z.infer<typeof TaskStateSchema>

export const RiskLevelSchema = z.enum(['read', 'write', 'external', 'critical'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const CapabilityKindSchema = z.enum(['agent', 'tool', 'device'])
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

const IdentifierSchema = z.string().trim().min(1).max(128)
const TimestampSchema = z.iso.datetime({ offset: true })
const Sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const PrincipalSchema = z.object({
  authStrength: z.enum(['local_process', 'local_bearer']),
  id: IdentifierSchema,
  kind: z.enum(['owner', 'service']),
  ownerId: IdentifierSchema,
})
export type Principal = z.infer<typeof PrincipalSchema>

export const TaskRequestSchema = z.object({
  actorId: IdentifierSchema,
  channel: IdentifierSchema,
  content: z.string().trim().min(1).max(50_000),
  contextRefs: z.array(z.string().trim().min(1).max(2_048)).max(64).default([]),
  createdAt: TimestampSchema,
  id: IdentifierSchema,
})
export type TaskRequest = z.infer<typeof TaskRequestSchema>

export const TaskSubmissionSchema = TaskRequestSchema.pick({
  content: true,
}).extend({
  actorId: IdentifierSchema.optional(),
  channel: IdentifierSchema.default('http'),
  contextRefs: z.array(z.string().trim().min(1).max(2_048)).max(64).default([]),
  createdAt: TimestampSchema.optional(),
  id: IdentifierSchema.optional(),
})
export type TaskSubmission = z.input<typeof TaskSubmissionSchema>

export const CapabilityDescriptorSchema = z.object({
  description: z.string().trim().min(1),
  id: IdentifierSchema,
  kind: CapabilityKindSchema,
  operations: z.array(z.string().trim().min(1)).min(1),
  riskLevel: RiskLevelSchema,
})
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>

export const TaskRecordSchema = TaskRequestSchema.extend({
  capabilityId: IdentifierSchema.nullable(),
  dshSessionId: z.string().nullable(),
  error: z.string().nullable(),
  result: z.string().nullable(),
  state: TaskStateSchema,
  updatedAt: TimestampSchema,
})
export type TaskRecord = z.infer<typeof TaskRecordSchema>

export const TaskEventTypeSchema = z.enum([
  'task.created',
  'task.state_changed',
  'routing.selected',
  'policy.evaluated',
  'approval.requested',
  'approval.resolved',
  'execution.started',
  'execution.progress',
  'tool.called',
  'tool.completed',
  'execution.completed',
  'execution.failed',
  'task.cancelled',
  'action.prepared',
  'action.authorized',
  'action.executing',
  'action.succeeded',
  'action.outcome_unknown',
  'action.cancel_requested',
  'action.cancelled',
  'action.reconciled',
  'research.source_captured',
  'verification.completed',
])
export type TaskEventType = z.infer<typeof TaskEventTypeSchema>

export const TaskEventSchema = z.object({
  id: IdentifierSchema,
  occurredAt: TimestampSchema,
  payload: z.record(z.string(), JsonValueSchema),
  sequence: z.number().int().nonnegative(),
  taskId: IdentifierSchema,
  type: TaskEventTypeSchema,
})
export type TaskEvent = z.infer<typeof TaskEventSchema>

export const AuditOutcomeSchema = z.enum(['allowed', 'denied', 'requested', 'succeeded', 'failed'])
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>

export const AuditRecordSchema = z.object({
  action: z.string().trim().min(1),
  actorId: IdentifierSchema,
  createdAt: TimestampSchema,
  detail: z.record(z.string(), JsonValueSchema),
  id: IdentifierSchema,
  outcome: AuditOutcomeSchema,
  targetId: IdentifierSchema,
  targetType: z.string().trim().min(1),
})
export type AuditRecord = z.infer<typeof AuditRecordSchema>

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

export const ApprovalRecordSchema = z.object({
  decidedAt: TimestampSchema.nullable(),
  decidedBy: IdentifierSchema.nullable(),
  id: IdentifierSchema,
  reason: z.string().trim().min(1),
  requestedAt: TimestampSchema,
  riskLevel: RiskLevelSchema,
  status: ApprovalStatusSchema,
  taskId: IdentifierSchema,
})
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>

export const TaskListQuerySchema = z.object({
  actorId: IdentifierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  state: TaskStateSchema.optional(),
})
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>

export const ActionOperationSchema = z.literal('artifact.write')
export type ActionOperation = z.infer<typeof ActionOperationSchema>

export const ActionEffectSchema = z.literal('local_artifact')
export type ActionEffect = z.infer<typeof ActionEffectSchema>

export const ActionStatusSchema = z.enum([
  'prepared',
  'authorized',
  'executing',
  'succeeded',
  'failed',
  'outcome_unknown',
  'cancelled',
])
export type ActionStatus = z.infer<typeof ActionStatusSchema>

export const ArtifactTargetSchema = z.object({
  artifactId: z.string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .refine(value => value !== '.' && value !== '..', 'Reserved artifact id'),
})
export type ArtifactTarget = z.infer<typeof ArtifactTargetSchema>

export const ActionCapabilitySchema = z.object({
  id: z.literal('local-artifact'),
  version: z.literal('1.0.0'),
})
export type ActionCapability = z.infer<typeof ActionCapabilitySchema>

export const ActionProposalSubmissionSchema = z.object({
  capability: ActionCapabilitySchema.default({
    id: 'local-artifact',
    version: '1.0.0',
  }),
  content: z.string().max(1_048_576),
  deadline: TimestampSchema.optional(),
  idempotencyKey: IdentifierSchema,
  operation: ActionOperationSchema,
  schemaVersion: z.literal('lumi.action-proposal/v1'),
  target: ArtifactTargetSchema,
})
export type ActionProposalSubmission = z.input<typeof ActionProposalSubmissionSchema>
export type ActionProposal = z.output<typeof ActionProposalSubmissionSchema>

export const ActionRecordSchema = z.object({
  actionDigest: Sha256DigestSchema,
  authorizationId: IdentifierSchema.nullable(),
  cancellationRequestedAt: TimestampSchema.nullable(),
  capability: ActionCapabilitySchema,
  createdAt: TimestampSchema,
  deadline: TimestampSchema.nullable(),
  effect: ActionEffectSchema,
  id: IdentifierSchema,
  idempotencyKey: IdentifierSchema,
  inputDigest: Sha256DigestSchema,
  inputRef: z.string().trim().min(1).max(256),
  operation: ActionOperationSchema,
  ownerId: IdentifierSchema,
  principalId: IdentifierSchema,
  receiptId: IdentifierSchema.nullable(),
  revocationEpoch: z.number().int().nonnegative(),
  schemaVersion: z.literal('lumi.action/v1'),
  status: ActionStatusSchema,
  target: ArtifactTargetSchema,
  taskId: IdentifierSchema,
  updatedAt: TimestampSchema,
  verificationId: IdentifierSchema.nullable(),
})
export type ActionRecord = z.infer<typeof ActionRecordSchema>

export const AuthorizationStatusSchema = z.enum(['active', 'consumed', 'revoked', 'expired'])
export type AuthorizationStatus = z.infer<typeof AuthorizationStatusSchema>

export const AuthorizationRecordSchema = z.object({
  actionDigest: Sha256DigestSchema,
  actionId: IdentifierSchema,
  capabilityVersion: z.string().trim().min(1).max(64),
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  id: IdentifierSchema,
  maxUses: z.number().int().positive(),
  ownerId: IdentifierSchema,
  policyVersion: z.string().trim().min(1).max(64),
  principalId: IdentifierSchema,
  remainingUses: z.number().int().nonnegative(),
  revocationEpoch: z.number().int().nonnegative(),
  schemaVersion: z.literal('lumi.authorization/v1'),
  status: AuthorizationStatusSchema,
  updatedAt: TimestampSchema,
})
export type AuthorizationRecord = z.infer<typeof AuthorizationRecordSchema>

export const ActionReceiptSchema = z.object({
  actionId: IdentifierSchema,
  artifactRef: z.string().trim().min(1).max(2_048),
  contentDigest: Sha256DigestSchema,
  createdAt: TimestampSchema,
  id: IdentifierSchema,
  providerVersion: z.string().trim().min(1).max(64),
  recovered: z.boolean(),
  schemaVersion: z.literal('lumi.action-receipt/v1'),
  status: z.literal('succeeded'),
})
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>

export const VerificationStatusSchema = z.enum(['passed', 'failed'])
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>

export const VerificationRecordSchema = z.object({
  actionId: IdentifierSchema,
  createdAt: TimestampSchema,
  evidenceRefs: z.array(z.string().trim().min(1).max(2_048)).max(16),
  expectedDigest: Sha256DigestSchema,
  id: IdentifierSchema,
  observedDigest: Sha256DigestSchema.nullable(),
  reason: z.string().trim().min(1).max(2_048),
  schemaVersion: z.literal('lumi.verification/v1'),
  status: VerificationStatusSchema,
  taskId: IdentifierSchema,
  verifierVersion: z.string().trim().min(1).max(64),
})
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>

export const ActionDetailSchema = z.object({
  action: ActionRecordSchema,
  authorization: AuthorizationRecordSchema.nullable(),
  receipt: ActionReceiptSchema.nullable(),
  task: TaskRecordSchema,
  verification: VerificationRecordSchema.nullable(),
})
export type ActionDetail = z.infer<typeof ActionDetailSchema>

export const ActionCancellationResultSchema = z.object({
  action: ActionRecordSchema,
  effectMayRemain: z.boolean(),
  preventedExecution: z.boolean(),
})
export type ActionCancellationResult = z.infer<typeof ActionCancellationResultSchema>

export const ActionErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'CONFLICT',
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'APPROVAL_EXPIRED',
  'OUTCOME_UNKNOWN',
  'VERIFICATION_FAILED',
  'CANCELLED',
  'INCOMPATIBLE_VERSION',
])
export type ActionErrorCode = z.infer<typeof ActionErrorCodeSchema>

export const ActionErrorSchema = z.object({
  code: ActionErrorCodeSchema,
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  safeToRetry: z.boolean(),
})
export type ActionError = z.infer<typeof ActionErrorSchema>

export function createTaskRequest(input: TaskSubmission & { actorId: string }): TaskRequest {
  const parsed = TaskSubmissionSchema.parse(input)
  return TaskRequestSchema.parse({
    ...parsed,
    id: parsed.id ?? `task_${randomUUID()}`,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
  })
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}
