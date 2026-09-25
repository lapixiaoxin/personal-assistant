export type TaskState =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RiskLevel = 'read' | 'write' | 'external' | 'critical'
export type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue }

export interface TaskRecord {
  actorId: string
  capabilityId: string | null
  channel: string
  content: string
  contextRefs: string[]
  createdAt: string
  dshSessionId: string | null
  error: string | null
  id: string
  result: string | null
  state: TaskState
  updatedAt: string
}

export interface ApprovalRecord {
  decidedAt: string | null
  decidedBy: string | null
  id: string
  reason: string
  requestedAt: string
  riskLevel: RiskLevel
  status: 'pending' | 'approved' | 'rejected'
  taskId: string
}

export interface TaskEvent {
  id: string
  occurredAt: string
  payload: Record<string, JsonValue>
  sequence: number
  taskId: string
  type: string
}

export interface AuditRecord {
  action: string
  actorId: string
  createdAt: string
  detail: Record<string, JsonValue>
  id: string
  outcome: string
  targetId: string
  targetType: string
}

export interface TaskDetail {
  approval: ApprovalRecord | null
  task: TaskRecord
}

export interface CapabilityDescriptor {
  description: string
  id: string
  kind: 'agent' | 'tool' | 'device'
  operations: string[]
  riskLevel: RiskLevel
}

export interface HealthStatus {
  executor: string
  status: string
}
