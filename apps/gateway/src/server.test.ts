import { afterEach, describe, expect, it } from 'vitest'
import type { TaskExecutor } from '@personal-assistant/assistant-core'
import { createAssistantRuntime, type AssistantRuntime } from '@personal-assistant/runtime'
import { buildGateway } from './server.ts'

const openRuntimes: AssistantRuntime[] = []

afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.close()
})

function testRuntime(): AssistantRuntime {
  const executor: TaskExecutor = {
    execute: async ({ capability, task }) => ({
      output: `${capability.id}:${task.content}`,
      sessionId: `session-${task.id}`,
    }),
  }
  const runtime = createAssistantRuntime({ dbPath: ':memory:', executor })
  openRuntimes.push(runtime)
  return runtime
}

describe('gateway', () => {
  it('uses the same task contract for submission, lookup, events, and audit', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.json()).toEqual({ executor: 'custom', status: 'ok' })

    const submitted = await app.inject({
      method: 'POST',
      payload: {
        actorId: 'user-1',
        channel: 'http',
        content: 'Implement a TypeScript endpoint',
        id: 'task-http',
      },
      url: '/v1/tasks',
    })

    expect(submitted.statusCode).toBe(201)
    expect(submitted.json().data.task).toMatchObject({
      capabilityId: 'coding-agent',
      id: 'task-http',
      state: 'completed',
    })

    const fetched = await app.inject({ method: 'GET', url: '/v1/tasks/task-http' })
    expect(fetched.json().data.task.result).toBe('coding-agent:Implement a TypeScript endpoint')

    const events = await app.inject({ method: 'GET', url: '/v1/tasks/task-http/events' })
    expect(events.json().data.map((event: { type: string }) => event.type))
      .toContain('execution.completed')

    const audit = await app.inject({ method: 'GET', url: '/v1/tasks/task-http/audit' })
    expect(audit.json().data.map((record: { action: string }) => record.action))
      .toContain('execution.complete')
    await app.close()
  })

  it('requires and records explicit approval for external actions', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const submitted = await app.inject({
      method: 'POST',
      payload: {
        actorId: 'user-1',
        content: 'Send this message to the team',
        id: 'task-http-approval',
      },
      url: '/v1/tasks',
    })
    expect(submitted.statusCode).toBe(202)
    expect(submitted.json().data.task.state).toBe('waiting_approval')

    const approved = await app.inject({
      method: 'POST',
      payload: { actorId: 'user-1' },
      url: '/v1/tasks/task-http-approval/approve',
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().data.state).toBe('completed')
    await app.close()
  })

  it('returns structured validation and not-found errors', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const invalid = await app.inject({
      method: 'POST',
      payload: { actorId: '', content: '' },
      url: '/v1/tasks',
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('INVALID_REQUEST')

    const missing = await app.inject({ method: 'GET', url: '/v1/tasks/missing' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('TASK_NOT_FOUND')
    await app.close()
  })
})
