import { describe, expect, it, vi } from 'vitest'
import { ApiError, isTaskActive, LumiApi } from '../src/api.ts'
import type { TaskRecord } from '../src/types.ts'

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

describe('LumiApi', () => {
  it('submits one task with the web channel and caller-provided id', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { approval: null, task },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 201,
    }))
    const api = new LumiApi(fetcher)

    await expect(api.submitTask('Summarize today', 'task-one')).resolves.toEqual({
      approval: null,
      task,
    })
    expect(fetcher).toHaveBeenCalledWith('/v1/tasks', {
      body: JSON.stringify({
        actorId: 'local-user',
        channel: 'web',
        content: 'Summarize today',
        id: 'task-one',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  })

  it('surfaces structured API failures', async () => {
    const api = new LumiApi(async () => new Response(JSON.stringify({
      error: { code: 'TASK_CONFLICT', message: 'Task already exists' },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 409,
    }))

    await expect(api.approve('task-one')).rejects.toEqual(
      new ApiError('Task already exists', 409, 'TASK_CONFLICT'),
    )
  })
})

describe('isTaskActive', () => {
  it.each([
    ['queued', true],
    ['running', true],
    ['waiting_approval', true],
    ['completed', false],
    ['failed', false],
    ['cancelled', false],
  ] as const)('classifies %s', (state, active) => {
    expect(isTaskActive({ ...task, state })).toBe(active)
  })
})
