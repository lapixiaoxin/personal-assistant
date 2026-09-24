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
  actorId: true,
  content: true,
}).extend({
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

export function createTaskRequest(input: TaskSubmission): TaskRequest {
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
