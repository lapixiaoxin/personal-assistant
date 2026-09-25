import { z } from 'zod'
import {
  IdentifierSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from './common.ts'

export const ReminderMisfirePolicySchema = z.enum(['latest', 'skip'])
export type ReminderMisfirePolicy = z.infer<typeof ReminderMisfirePolicySchema>

export const ReminderStatusSchema = z.enum([
  'scheduled',
  'fired',
  'skipped',
  'cancelled',
])
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>

const ReminderFireAtSchema = TimestampSchema.refine(
  value => /(Z|[+-]\d{2}:\d{2})$/.test(value),
  'Reminder fireAt must include an explicit UTC offset',
)

const TimeZoneSchema = z.string().trim().min(1).max(128).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}, 'Unsupported IANA timezone')

export const ReminderCreateSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  fireAt: ReminderFireAtSchema,
  idempotencyKey: IdentifierSchema,
  misfirePolicy: ReminderMisfirePolicySchema.default('latest'),
  timezone: TimeZoneSchema,
})
export type ReminderCreate = z.input<typeof ReminderCreateSchema>
export type NormalizedReminderCreate = z.output<typeof ReminderCreateSchema>

export const ReminderRecordSchema = z.object({
  cancelledAt: TimestampSchema.nullable(),
  content: z.string().trim().min(1).max(4_000),
  createdAt: TimestampSchema,
  fireAt: TimestampSchema,
  firedAt: TimestampSchema.nullable(),
  id: IdentifierSchema,
  idempotencyKey: IdentifierSchema,
  misfirePolicy: ReminderMisfirePolicySchema,
  nextFireAt: TimestampSchema.nullable(),
  notificationId: IdentifierSchema.nullable(),
  ownerId: IdentifierSchema,
  principalId: IdentifierSchema,
  requestDigest: Sha256DigestSchema,
  schemaVersion: z.literal('lumi.reminder/v1'),
  skippedAt: TimestampSchema.nullable(),
  status: ReminderStatusSchema,
  timezone: TimeZoneSchema,
  updatedAt: TimestampSchema,
})
export type ReminderRecord = z.infer<typeof ReminderRecordSchema>

export const ReminderListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  status: ReminderStatusSchema.optional(),
})
export type ReminderListQuery = z.infer<typeof ReminderListQuerySchema>

export const NotificationStatusSchema = z.enum(['unread', 'acknowledged'])
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>

export const NotificationRecordSchema = z.object({
  acknowledgedAt: TimestampSchema.nullable(),
  content: z.string().trim().min(1).max(4_000),
  createdAt: TimestampSchema,
  dedupeKey: IdentifierSchema,
  id: IdentifierSchema,
  ownerId: IdentifierSchema,
  principalId: IdentifierSchema,
  reminderId: IdentifierSchema,
  schemaVersion: z.literal('lumi.notification/v1'),
  status: NotificationStatusSchema,
})
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>

export const NotificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  status: NotificationStatusSchema.optional(),
})
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>
