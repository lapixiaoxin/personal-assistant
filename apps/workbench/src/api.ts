import type {
  ActionCancellationResult,
  ActionDetail,
  ActionRecord,
  AuditRecord,
  CapabilityDescriptor,
  HealthStatus,
  MemoryClassification,
  MemoryKind,
  MemoryPurpose,
  MemoryScope,
  MemoryStatus,
  PersonalMemory,
  PersonalMemoryTombstone,
  RecoveryRecord,
  RecoveryRetryResult,
  TaskDetail,
  TaskEvent,
  TaskRecord,
} from './types.ts'

type Fetcher = typeof fetch

interface DataEnvelope<T> {
  data: T
}

interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

export interface MeetingBriefInput {
  agenda: string[]
  background?: string
  objective: string
  participants: string[]
  topic: string
}

export interface MemoryInput {
  allowedPurposes: MemoryPurpose[]
  classification: MemoryClassification
  content: string
  kind: MemoryKind
  scope: MemoryScope
  status: Extract<MemoryStatus, 'candidate' | 'confirmed'>
}

export interface MemoryCorrectionInput {
  allowedPurposes?: MemoryPurpose[]
  classification?: MemoryClassification
  content: string
  kind?: MemoryKind
  scope?: MemoryScope
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface LumiApiClient {
  acknowledgeRecovery(recoveryId: string): Promise<RecoveryRecord>
  authorizeAction(actionId: string): Promise<ActionDetail>
  approve(taskId: string): Promise<TaskRecord>
  cancel(taskId: string): Promise<TaskRecord>
  cancelAction(actionId: string): Promise<ActionCancellationResult>
  capabilities(): Promise<CapabilityDescriptor[]>
  confirmMemory(memoryId: string): Promise<PersonalMemory>
  correctMemory(memoryId: string, input: MemoryCorrectionInput): Promise<PersonalMemory>
  createMemory(input: MemoryInput): Promise<PersonalMemory>
  executeAction(actionId: string): Promise<ActionDetail>
  forgetMemory(memoryId: string): Promise<PersonalMemoryTombstone>
  getAction(actionId: string): Promise<ActionDetail>
  getAudit(taskId: string): Promise<AuditRecord[]>
  getEvents(taskId: string): Promise<TaskEvent[]>
  getTaskRecovery(taskId: string): Promise<RecoveryRecord | undefined>
  getTask(taskId: string): Promise<TaskDetail>
  health(): Promise<HealthStatus>
  listActions(): Promise<ActionDetail[]>
  listMemories(): Promise<PersonalMemory[]>
  listTasks(): Promise<TaskRecord[]>
  reconcileAction(actionId: string): Promise<ActionDetail>
  reject(taskId: string): Promise<TaskRecord>
  retractMemory(memoryId: string): Promise<PersonalMemory>
  retryRecovery(recoveryId: string): Promise<RecoveryRetryResult>
  submitMeetingBrief(input: MeetingBriefInput, id: string): Promise<TaskDetail>
  submitResearchBrief(question: string, sources: string[], id: string): Promise<TaskDetail>
  submitTask(content: string, id: string): Promise<TaskDetail>
}

export class LumiApi implements LumiApiClient {
  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
    private readonly token: string | undefined = resolveBrowserToken(),
  ) {}

  health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health')
  }

  capabilities(): Promise<CapabilityDescriptor[]> {
    return this.request<DataEnvelope<CapabilityDescriptor[]>>('/v1/capabilities')
      .then(response => response.data)
  }

  listTasks(): Promise<TaskRecord[]> {
    return this.request<DataEnvelope<TaskRecord[]>>('/v1/tasks?limit=100')
      .then(response => response.data)
  }

  listActions(): Promise<ActionDetail[]> {
    return this.request<DataEnvelope<ActionDetail[]>>('/v2/actions?limit=100')
      .then(response => response.data)
  }

  listMemories(): Promise<PersonalMemory[]> {
    return this.request<DataEnvelope<PersonalMemory[]>>('/v2/memories?limit=100')
      .then(response => response.data)
  }

  getTaskRecovery(taskId: string): Promise<RecoveryRecord | undefined> {
    return this.request<DataEnvelope<RecoveryRecord[]>>(
      `/v2/recoveries?limit=1&taskId=${encodeURIComponent(taskId)}`,
    ).then(response => response.data[0])
  }

  getTask(taskId: string): Promise<TaskDetail> {
    return this.request<DataEnvelope<TaskDetail>>(`/v1/tasks/${encodeURIComponent(taskId)}`)
      .then(response => response.data)
  }

  getAction(actionId: string): Promise<ActionDetail> {
    return this.request<DataEnvelope<ActionDetail>>(
      `/v2/actions/${encodeURIComponent(actionId)}`,
    ).then(response => response.data)
  }

  getEvents(taskId: string): Promise<TaskEvent[]> {
    return this.request<DataEnvelope<TaskEvent[]>>(
      `/v1/tasks/${encodeURIComponent(taskId)}/events`,
    ).then(response => response.data)
  }

  getAudit(taskId: string): Promise<AuditRecord[]> {
    return this.request<DataEnvelope<AuditRecord[]>>(
      `/v1/tasks/${encodeURIComponent(taskId)}/audit`,
    ).then(response => response.data)
  }

  submitTask(content: string, id: string): Promise<TaskDetail> {
    return this.request<DataEnvelope<TaskDetail>>('/v1/tasks', {
      body: JSON.stringify({
        channel: 'web',
        content,
        id,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(response => response.data)
  }

  submitResearchBrief(question: string, sources: string[], id: string): Promise<TaskDetail> {
    return this.request<DataEnvelope<TaskDetail>>('/v2/workflows/research-brief', {
      body: JSON.stringify({
        id,
        question,
        schemaVersion: 'lumi.research-brief/v1',
        sources,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(response => response.data)
  }

  submitMeetingBrief(input: MeetingBriefInput, id: string): Promise<TaskDetail> {
    return this.request<DataEnvelope<TaskDetail>>('/v2/workflows/meeting-brief', {
      body: JSON.stringify({
        ...input,
        id,
        schemaVersion: 'lumi.meeting-brief/v1',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(response => response.data)
  }

  createMemory(input: MemoryInput): Promise<PersonalMemory> {
    return this.request<DataEnvelope<PersonalMemory>>('/v2/memories', {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(response => response.data)
  }

  confirmMemory(memoryId: string): Promise<PersonalMemory> {
    return this.memoryCommand(memoryId, 'confirm')
  }

  correctMemory(memoryId: string, input: MemoryCorrectionInput): Promise<PersonalMemory> {
    return this.request<DataEnvelope<PersonalMemory>>(
      `/v2/memories/${encodeURIComponent(memoryId)}/correct`,
      {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  retractMemory(memoryId: string): Promise<PersonalMemory> {
    return this.memoryCommand(memoryId, 'retract')
  }

  forgetMemory(memoryId: string): Promise<PersonalMemoryTombstone> {
    return this.request<DataEnvelope<PersonalMemoryTombstone>>(
      `/v2/memories/${encodeURIComponent(memoryId)}`,
      { method: 'DELETE' },
    ).then(response => response.data)
  }

  approve(taskId: string): Promise<TaskRecord> {
    return this.decide(taskId, 'approve')
  }

  reject(taskId: string): Promise<TaskRecord> {
    return this.decide(taskId, 'reject')
  }

  cancel(taskId: string): Promise<TaskRecord> {
    return this.decide(taskId, 'cancel')
  }

  authorizeAction(actionId: string): Promise<ActionDetail> {
    return this.actionCommand<ActionDetail>(actionId, 'authorize')
  }

  executeAction(actionId: string): Promise<ActionDetail> {
    return this.actionCommand<ActionDetail>(actionId, 'execute')
  }

  reconcileAction(actionId: string): Promise<ActionDetail> {
    return this.actionCommand<ActionDetail>(actionId, 'reconcile')
  }

  cancelAction(actionId: string): Promise<ActionCancellationResult> {
    return this.actionCommand<ActionCancellationResult>(actionId, 'cancel')
  }

  retryRecovery(recoveryId: string): Promise<RecoveryRetryResult> {
    return this.recoveryCommand<RecoveryRetryResult>(recoveryId, 'retry')
  }

  acknowledgeRecovery(recoveryId: string): Promise<RecoveryRecord> {
    return this.recoveryCommand<RecoveryRecord>(recoveryId, 'acknowledge')
  }

  private decide(taskId: string, decision: 'approve' | 'cancel' | 'reject'): Promise<TaskRecord> {
    return this.request<DataEnvelope<TaskRecord>>(
      `/v1/tasks/${encodeURIComponent(taskId)}/${decision}`,
      {
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  private actionCommand<T>(
    actionId: string,
    command: 'authorize' | 'cancel' | 'execute' | 'reconcile',
  ): Promise<T> {
    return this.request<DataEnvelope<T>>(
      `/v2/actions/${encodeURIComponent(actionId)}/${command}`,
      {
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  private memoryCommand(
    memoryId: string,
    command: 'confirm' | 'retract',
  ): Promise<PersonalMemory> {
    return this.request<DataEnvelope<PersonalMemory>>(
      `/v2/memories/${encodeURIComponent(memoryId)}/${command}`,
      {
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  private recoveryCommand<T>(
    recoveryId: string,
    command: 'acknowledge' | 'retry',
  ): Promise<T> {
    return this.request<DataEnvelope<T>>(
      `/v2/recoveries/${encodeURIComponent(recoveryId)}/${command}`,
      {
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    if (this.token) headers.set('authorization', `Bearer ${this.token}`)
    const response = await this.fetcher(path, {
      ...init,
      headers,
    })
    const body = await response.json() as T & ErrorEnvelope
    if (!response.ok) {
      throw new ApiError(
        body.error?.message ?? `Request failed with status ${response.status}`,
        response.status,
        body.error?.code,
      )
    }
    return body
  }
}

export function createTaskId(): string {
  return `task_${crypto.randomUUID()}`
}

export function isTaskActive(task: TaskRecord): boolean {
  return task.state === 'queued'
    || task.state === 'running'
    || task.state === 'reconciling'
    || task.state === 'waiting_approval'
}

export function isActionAwaitingUser(action: ActionRecord): boolean {
  return action.status === 'prepared'
    || action.status === 'authorized'
    || action.status === 'outcome_unknown'
}

function resolveBrowserToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const supplied = fragment.get('token')?.trim()
  if (supplied) {
    window.sessionStorage.setItem('lumi.httpToken', supplied)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    return supplied
  }
  return window.sessionStorage.getItem('lumi.httpToken') ?? undefined
}
