import type {
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
  approve(taskId: string): Promise<TaskRecord>
  cancel(taskId: string): Promise<TaskRecord>
  capabilities(): Promise<CapabilityDescriptor[]>
  getAudit(taskId: string): Promise<AuditRecord[]>
  getEvents(taskId: string): Promise<TaskEvent[]>
  getTask(taskId: string): Promise<TaskDetail>
  health(): Promise<HealthStatus>
  listTasks(): Promise<TaskRecord[]>
  reject(taskId: string): Promise<TaskRecord>
  submitTask(content: string, id: string): Promise<TaskDetail>
}

export class LumiApi implements LumiApiClient {
  constructor(private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {}

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

  getTask(taskId: string): Promise<TaskDetail> {
    return this.request<DataEnvelope<TaskDetail>>(`/v1/tasks/${encodeURIComponent(taskId)}`)
      .then(response => response.data)
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
        actorId: 'local-user',
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

  private decide(taskId: string, decision: 'approve' | 'cancel' | 'reject'): Promise<TaskRecord> {
    return this.request<DataEnvelope<TaskRecord>>(
      `/v1/tasks/${encodeURIComponent(taskId)}/${decision}`,
      {
        body: JSON.stringify({ actorId: 'local-user' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ).then(response => response.data)
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(path, init)
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
