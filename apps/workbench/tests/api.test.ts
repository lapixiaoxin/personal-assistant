import { describe, expect, it } from 'vitest'
import { ApiError, isTaskActive, LumiApi, type MemoryInput } from '../src/api.ts'
import type {
  ActionDetail,
  PersonalMemory,
  RecoveryRecord,
  TaskRecord,
} from '../src/types.ts'

const task: TaskRecord = {
  actorId: 'local-user',
  capabilityId: 'personal-assistant',
  channel: 'web',
  content: 'Summarize today',
  contextRefs: [],
  createdAt: '2026-09-25T09:00:00.000Z',
  dshSessionId: null,
  error: null,
  id: 'task-one',
  result: null,
  state: 'running',
  updatedAt: '2026-09-25T09:00:01.000Z',
}

const actionDetail: ActionDetail = {
  action: {
    actionDigest: 'a'.repeat(64),
    authorizationId: null,
    cancellationRequestedAt: null,
    capability: {
      id: 'local-artifact',
      version: '1.0.0',
    },
    createdAt: '2026-09-25T09:00:00.000Z',
    deadline: null,
    effect: 'local_artifact',
    id: 'action-one',
    idempotencyKey: 'idempotency-one',
    inputDigest: 'b'.repeat(64),
    inputRef: 'ledger://actions/action-one/input',
    operation: 'artifact.write',
    ownerId: 'local-user',
    principalId: 'local-user',
    receiptId: null,
    revocationEpoch: 0,
    schemaVersion: 'lumi.action/v1',
    status: 'prepared',
    target: { artifactId: 'brief.md' },
    taskId: 'task-one',
    updatedAt: '2026-09-25T09:00:00.000Z',
    verificationId: null,
  },
  authorization: null,
  receipt: null,
  task,
  verification: null,
}

const personalMemory: PersonalMemory = {
  allowedPurposes: ['general_assistance'],
  classification: 'personal',
  confidence: 1,
  confirmedAt: '2026-09-25T09:00:00.000Z',
  content: 'Prefer concise answers',
  createdAt: '2026-09-25T09:00:00.000Z',
  id: 'memory-one',
  kind: 'preference',
  ownerId: 'local-owner',
  retractedAt: null,
  revision: 1,
  scope: 'global',
  source: 'explicit_user_input',
  status: 'confirmed',
  updatedAt: '2026-09-25T09:00:00.000Z',
}

const recovery: RecoveryRecord = {
  actionId: null,
  detectedAt: '2026-09-25T09:01:00.000Z',
  disposition: 'retry_available',
  id: 'recovery-one',
  ownerId: 'local-owner',
  principalId: 'local-user',
  reasonCode: 'HOST_RESTART_SAFE_TO_RETRY',
  replacementCreatedAt: null,
  replacementTaskId: null,
  resolution: null,
  resolvedAt: null,
  safeToRetry: true,
  schemaVersion: 'lumi.recovery/v1',
  status: 'pending',
  taskId: task.id,
}

describe('LumiApi', () => {
  it('submits one task with the web channel and caller-provided id', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      return new Response(JSON.stringify({
        data: { approval: null, task },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')

    await expect(api.submitTask('Summarize today', 'task-one')).resolves.toEqual({
      approval: null,
      task,
    })
    expect(calls).toHaveLength(1)
    const [path, request] = calls[0] ?? []
    expect(path).toBe('/v1/tasks')
    expect(request).toMatchObject({
      body: JSON.stringify({
        channel: 'web',
        content: 'Summarize today',
        id: 'task-one',
      }),
      method: 'POST',
    })
    expect(new Headers(request?.headers).get('authorization')).toBe('Bearer test-token')
    expect(new Headers(request?.headers).get('content-type')).toBe('application/json')
  })

  it('surfaces structured API failures', async () => {
    const api = new LumiApi(
      async () => new Response(JSON.stringify({
        error: { code: 'TASK_CONFLICT', message: 'Task already exists' },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 409,
      }),
      'test-token',
    )

    await expect(api.approve('task-one')).rejects.toEqual(
      new ApiError('Task already exists', 409, 'TASK_CONFLICT'),
    )
  })

  it('submits a structured research brief without exposing context encoding', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      return new Response(JSON.stringify({
        data: {
          approval: null,
          task: {
            ...task,
            capabilityId: 'research-agent',
            channel: 'research-brief',
            content: 'Compare sources',
          },
        },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')

    await api.submitResearchBrief(
      'Compare sources',
      ['https://example.com', 'https://example.org/report'],
      'task-one',
    )

    expect(calls[0]?.[0]).toBe('/v2/workflows/research-brief')
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      id: 'task-one',
      question: 'Compare sources',
      schemaVersion: 'lumi.research-brief/v1',
      sources: ['https://example.com', 'https://example.org/report'],
    })
  })

  it('submits structured meeting context through the workflow endpoint', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      return new Response(JSON.stringify({
        data: {
          approval: null,
          task: {
            ...task,
            capabilityId: 'meeting-agent',
            channel: 'meeting-brief',
          },
        },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')

    await api.submitMeetingBrief({
      agenda: ['Review options', 'Choose owner'],
      background: 'Delivery date is fixed.',
      objective: 'Select a plan.',
      participants: ['Product lead', 'Engineering lead'],
      topic: 'Implementation review',
    }, 'task-one')

    expect(calls[0]?.[0]).toBe('/v2/workflows/meeting-brief')
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      agenda: ['Review options', 'Choose owner'],
      background: 'Delivery date is fixed.',
      id: 'task-one',
      objective: 'Select a plan.',
      participants: ['Product lead', 'Engineering lead'],
      schemaVersion: 'lumi.meeting-brief/v1',
      topic: 'Implementation review',
    })
  })

  it('uses the v2 action lifecycle endpoints without changing the payload', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      const path = String(input)
      const data = path.endsWith('/cancel')
        ? {
            action: { ...actionDetail.action, status: 'cancelled' },
            effectMayRemain: false,
            preventedExecution: true,
          }
        : path.includes('?limit=')
          ? [actionDetail]
          : actionDetail
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')

    await api.listActions()
    await api.getAction('action-one')
    await api.authorizeAction('action-one')
    await api.executeAction('action-one')
    await api.reconcileAction('action-one')
    await api.cancelAction('action-one')

    expect(calls.map(([path]) => path)).toEqual([
      '/v2/actions?limit=100',
      '/v2/actions/action-one',
      '/v2/actions/action-one/authorize',
      '/v2/actions/action-one/execute',
      '/v2/actions/action-one/reconcile',
      '/v2/actions/action-one/cancel',
    ])
    for (const [, request] of calls.slice(2)) {
      expect(request?.method).toBe('POST')
      expect(request?.body).toBe(JSON.stringify({}))
      expect(new Headers(request?.headers).get('authorization')).toBe('Bearer test-token')
    }
  })

  it('uses the v2 personal memory lifecycle endpoints', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      const path = String(input)
      const data = path.includes('?limit=')
        ? [personalMemory]
        : path.endsWith('/memory-one') && init?.method === 'DELETE'
          ? {
              contentDigest: `sha256:${'a'.repeat(64)}`,
              erasedAt: personalMemory.updatedAt,
              id: personalMemory.id,
              lastRevision: personalMemory.revision,
              ownerId: personalMemory.ownerId,
            }
          : personalMemory
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: path === '/v2/memories' ? 201 : 200,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')
    const input: MemoryInput = {
      allowedPurposes: ['general_assistance'],
      classification: 'personal',
      content: personalMemory.content,
      kind: 'preference',
      scope: 'global',
      status: 'confirmed',
    }

    await api.listMemories()
    await api.createMemory(input)
    await api.confirmMemory(personalMemory.id)
    await api.correctMemory(personalMemory.id, {
      content: 'Prefer direct answers',
    })
    await api.retractMemory(personalMemory.id)
    await api.forgetMemory(personalMemory.id)

    expect(calls.map(([path]) => path)).toEqual([
      '/v2/memories?limit=100',
      '/v2/memories',
      '/v2/memories/memory-one/confirm',
      '/v2/memories/memory-one/correct',
      '/v2/memories/memory-one/retract',
      '/v2/memories/memory-one',
    ])
    expect(calls[1]?.[1]).toMatchObject({
      body: JSON.stringify(input),
      method: 'POST',
    })
    expect(calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({ content: 'Prefer direct answers' }),
      method: 'POST',
    })
    expect(calls[5]?.[1]?.method).toBe('DELETE')
  })

  it('uses the scoped recovery lookup and command endpoints', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      const path = String(input)
      const data = path.includes('?limit=')
        ? [recovery]
        : path.endsWith('/retry')
          ? {
              recovery: { ...recovery, resolution: 'retried', status: 'resolved' },
              task: { ...task, id: 'task-retried', state: 'completed' },
            }
          : { ...recovery, resolution: 'acknowledged', status: 'resolved' }
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }
    const api = new LumiApi(fetcher, 'test-token')

    await expect(api.getTaskRecovery(task.id)).resolves.toEqual(recovery)
    await api.retryRecovery(recovery.id)
    await api.acknowledgeRecovery(recovery.id)

    expect(calls.map(([path]) => path)).toEqual([
      '/v2/recoveries?limit=1&taskId=task-one',
      '/v2/recoveries/recovery-one/retry',
      '/v2/recoveries/recovery-one/acknowledge',
    ])
    for (const [, request] of calls.slice(1)) {
      expect(request?.method).toBe('POST')
      expect(request?.body).toBe(JSON.stringify({}))
    }
  })
})

describe('isTaskActive', () => {
  it.each([
    ['queued', true],
    ['running', true],
    ['waiting_approval', true],
    ['reconciling', true],
    ['interrupted', false],
    ['completed', false],
    ['failed', false],
    ['cancelled', false],
  ] as const)('classifies %s', (state, active) => {
    expect(isTaskActive({ ...task, state })).toBe(active)
  })
})
