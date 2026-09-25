import type {
  ActionCancellationResult,
  ActionDetail,
  ActionRecord,
  AuditRecord,
  CapabilityDescriptor,
  HealthStatus,
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
  authorizeAction(actionId: string): Promise<ActionDetail>
  approve(taskId: string): Promise<TaskRecord>
  cancel(taskId: string): Promise<TaskRecord>
  cancelAction(actionId: string): Promise<ActionCancellationResult>
  capabilities(): Promise<CapabilityDescriptor[]>
  executeAction(actionId: string): Promise<ActionDetail>
  getAction(actionId: string): Promise<ActionDetail>
  getAudit(taskId: string): Promise<AuditRecord[]>
  getEvents(taskId: string): Promise<TaskEvent[]>
  getTask(taskId: string): Promise<TaskDetail>
  health(): Promise<HealthStatus>
  listActions(): Promise<ActionDetail[]>
  listTasks(): Promise<TaskRecord[]>
  reconcileAction(actionId: string): Promise<ActionDetail>
  reject(taskId: string): Promise<TaskRecord>
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
