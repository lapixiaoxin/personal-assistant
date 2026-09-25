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

export type ActionStatus =
  | 'prepared'
  | 'authorized'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled'

export interface ActionRecord {
  actionDigest: string
  authorizationId: string | null
  cancellationRequestedAt: string | null
  capability: {
    id: 'local-artifact'
    version: '1.0.0'
  }
  createdAt: string
  deadline: string | null
  effect: 'local_artifact'
  id: string
  idempotencyKey: string
  inputDigest: string
  inputRef: string
  operation: 'artifact.write'
  ownerId: string
  principalId: string
  receiptId: string | null
  revocationEpoch: number
  schemaVersion: 'lumi.action/v1'
  status: ActionStatus
  target: {
    artifactId: string
  }
  taskId: string
  updatedAt: string
  verificationId: string | null
}

export interface AuthorizationRecord {
  actionDigest: string
  actionId: string
  capabilityVersion: string
  createdAt: string
  expiresAt: string
  id: string
  maxUses: number
  ownerId: string
  policyVersion: string
  principalId: string
  remainingUses: number
  revocationEpoch: number
  schemaVersion: 'lumi.authorization/v1'
  status: 'active' | 'consumed' | 'revoked' | 'expired'
  updatedAt: string
}

export interface ActionReceipt {
  actionId: string
  artifactRef: string
  contentDigest: string
  createdAt: string
  id: string
  providerVersion: string
  recovered: boolean
  schemaVersion: 'lumi.action-receipt/v1'
  status: 'succeeded'
}

export interface VerificationRecord {
  actionId: string
  createdAt: string
  evidenceRefs: string[]
  expectedDigest: string
  id: string
  observedDigest: string | null
  reason: string
  schemaVersion: 'lumi.verification/v1'
  status: 'passed' | 'failed'
  taskId: string
  verifierVersion: string
}

export interface ActionDetail {
  action: ActionRecord
  authorization: AuthorizationRecord | null
  receipt: ActionReceipt | null
  task: TaskRecord
  verification: VerificationRecord | null
}

export interface ActionCancellationResult {
  action: ActionRecord
  effectMayRemain: boolean
  preventedExecution: boolean
}

export type MemoryKind = 'fact' | 'preference' | 'relationship' | 'experience'
export type MemoryScope = 'global' | 'general' | 'coding' | 'research' | 'meeting'
export type MemoryClassification = 'public' | 'personal' | 'sensitive' | 'secret'
export type MemoryPurpose = 'general_assistance' | 'coding' | 'research' | 'meeting'
export type MemoryStatus = 'candidate' | 'confirmed' | 'retracted'

export interface PersonalMemory {
  allowedPurposes: MemoryPurpose[]
  classification: MemoryClassification
  confidence: number
  confirmedAt: string | null
  content: string
  createdAt: string
  id: string
  kind: MemoryKind
  ownerId: string
  retractedAt: string | null
  revision: number
  scope: MemoryScope
  source: string
  status: MemoryStatus
  updatedAt: string
}

export interface PersonalMemoryTombstone {
  contentDigest: string
  erasedAt: string
  id: string
  lastRevision: number
  ownerId: string
}
