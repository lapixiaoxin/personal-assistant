import { z } from 'zod'
import {
  IdentifierSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from './common.ts'
import { TaskRecordSchema } from './task.ts'

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
