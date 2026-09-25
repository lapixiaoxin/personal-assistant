import { z } from 'zod'
import { IdentifierSchema, TimestampSchema } from './common.ts'
import { TaskRecordSchema } from './task.ts'

export const RecoveryDispositionSchema = z.enum([
  'retry_available',
  'manual_review',
  'reconcile_action',
])
export type RecoveryDisposition = z.infer<typeof RecoveryDispositionSchema>

export const RecoveryReasonCodeSchema = z.enum([
  'HOST_RESTART_SAFE_TO_RETRY',
  'HOST_RESTART_EFFECT_MAY_HAVE_OCCURRED',
  'ACTION_OUTCOME_UNKNOWN',
  'ACTION_VERIFICATION_PENDING',
])
export type RecoveryReasonCode = z.infer<typeof RecoveryReasonCodeSchema>

export const RecoveryStatusSchema = z.enum(['pending', 'retrying', 'resolved'])
export type RecoveryStatus = z.infer<typeof RecoveryStatusSchema>

export const RecoveryResolutionSchema = z.enum([
  'acknowledged',
  'reconciled',
  'retried',
])
export type RecoveryResolution = z.infer<typeof RecoveryResolutionSchema>

export const RecoveryRecordSchema = z.object({
  actionId: IdentifierSchema.nullable(),
  detectedAt: TimestampSchema,
  disposition: RecoveryDispositionSchema,
  id: IdentifierSchema,
  ownerId: IdentifierSchema,
  principalId: IdentifierSchema,
  reasonCode: RecoveryReasonCodeSchema,
  replacementCreatedAt: TimestampSchema.nullable(),
  replacementTaskId: IdentifierSchema.nullable(),
  resolution: RecoveryResolutionSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
  safeToRetry: z.boolean(),
  schemaVersion: z.literal('lumi.recovery/v1'),
  status: RecoveryStatusSchema,
  taskId: IdentifierSchema,
})
export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>

export const RecoveryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: RecoveryStatusSchema.optional(),
  taskId: IdentifierSchema.optional(),
})
export type RecoveryListQuery = z.infer<typeof RecoveryListQuerySchema>

export const RecoveryRetryResultSchema = z.object({
  recovery: RecoveryRecordSchema,
  task: TaskRecordSchema,
})
export type RecoveryRetryResult = z.infer<typeof RecoveryRetryResultSchema>
