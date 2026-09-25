// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import type { LumiApiClient } from '../src/api.ts'
import type { ApprovalRecord, TaskRecord } from '../src/types.ts'

afterEach(() => cleanup())

const waitingTask: TaskRecord = {
  actorId: 'local-user',
  capabilityId: 'personal-assistant',
  channel: 'web',
  content: 'Send this report to the team',
  contextRefs: [],
  createdAt: '2026-09-25T09:00:00.000Z',
  dshSessionId: null,
  error: null,
  id: 'task-approval',
  result: null,
  state: 'waiting_approval',
  updatedAt: '2026-09-25T09:00:01.000Z',
}

const approval: ApprovalRecord = {
  decidedAt: null,
  decidedBy: null,
  id: 'approval-one',
  reason: 'Explicit approval is required for external operations.',
  requestedAt: '2026-09-25T09:00:01.000Z',
  riskLevel: 'external',
  status: 'pending',
  taskId: waitingTask.id,
}

function fakeApi(tasks: TaskRecord[] = []): LumiApiClient {
  return {
    approve: vi.fn(async () => ({ ...waitingTask, state: 'completed' })),
    cancel: vi.fn(async () => ({ ...waitingTask, state: 'cancelled' })),
    capabilities: vi.fn(async () => []),
    getAudit: vi.fn(async () => []),
    getEvents: vi.fn(async () => []),
    getTask: vi.fn(async taskId => ({
      approval: taskId === waitingTask.id ? approval : null,
      task: tasks.find(task => task.id === taskId) ?? waitingTask,
    })),
    health: vi.fn(async () => ({ executor: 'mock', status: 'ok' })),
    listTasks: vi.fn(async () => tasks),
    reject: vi.fn(async () => ({ ...waitingTask, state: 'cancelled' })),
    submitTask: vi.fn(async (content, id) => ({
      approval: null,
      task: { ...waitingTask, content, id, state: 'completed' },
    })),
  }
}

describe('Workbench', () => {
  it('opens as a usable task composer when no history exists', async () => {
    render(<App api={fakeApi()} />)

    expect(await screen.findByText('把工作交给 lumi')).toBeTruthy()
    expect(screen.getByLabelText('任务内容')).toBeTruthy()
    expect((screen.getByLabelText('提交任务') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a pending approval and dispatches the decision', async () => {
    const api = fakeApi([waitingTask])
    render(<App api={api} />)

    expect(await screen.findByText('需要确认')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '允许' }))

    await waitFor(() => expect(api.approve).toHaveBeenCalledWith(waitingTask.id))
  })
})
