// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import type { LumiApiClient } from '../src/api.ts'
import type { ActionDetail, ActionStatus, ApprovalRecord, TaskRecord } from '../src/types.ts'

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
  return fakeApiWithActions(tasks, [])
}

function fakeApiWithActions(
  tasks: TaskRecord[] = [],
  initialActions: ActionDetail[] = [],
): LumiApiClient {
  let actions = initialActions
  let taskRecords = tasks
  const replaceAction = (actionId: string, status: ActionStatus): ActionDetail => {
    const current = actions.find(item => item.action.id === actionId)
    if (!current) throw new Error(`Action not found: ${actionId}`)
    const next = {
      ...current,
      action: {
        ...current.action,
        authorizationId: status === 'authorized' ? 'authorization-one' : current.action.authorizationId,
        status,
      },
      authorization: status === 'authorized'
        ? {
            actionDigest: current.action.actionDigest,
            actionId,
            capabilityVersion: '1.0.0',
            createdAt: '2026-09-25T09:01:00.000Z',
            expiresAt: '2026-09-25T09:11:00.000Z',
            id: 'authorization-one',
            maxUses: 1,
            ownerId: 'local-user',
            policyVersion: 'default-v1',
            principalId: 'local-user',
            remainingUses: 1,
            revocationEpoch: 0,
            schemaVersion: 'lumi.authorization/v1' as const,
            status: 'active' as const,
            updatedAt: '2026-09-25T09:01:00.000Z',
          }
        : current.authorization,
    }
    actions = actions.map(item => item.action.id === actionId ? next : item)
    return next
  }

  return {
    authorizeAction: vi.fn(async actionId => replaceAction(actionId, 'authorized')),
    approve: vi.fn(async () => ({ ...waitingTask, state: 'completed' as const })),
    cancel: vi.fn(async () => ({ ...waitingTask, state: 'cancelled' as const })),
    cancelAction: vi.fn(async actionId => ({
      action: replaceAction(actionId, 'cancelled').action,
      effectMayRemain: false,
      preventedExecution: true,
    })),
    capabilities: vi.fn(async () => []),
    executeAction: vi.fn(async actionId => replaceAction(actionId, 'succeeded')),
    getAction: vi.fn(async actionId => {
      const current = actions.find(item => item.action.id === actionId)
      if (!current) throw new Error(`Action not found: ${actionId}`)
      return current
    }),
    getAudit: vi.fn(async () => []),
    getEvents: vi.fn(async () => []),
    getTask: vi.fn(async taskId => ({
      approval: taskId === waitingTask.id ? approval : null,
      task: taskRecords.find(task => task.id === taskId) ?? waitingTask,
    })),
    health: vi.fn(async () => ({ executor: 'mock', status: 'ok' })),
    listActions: vi.fn(async () => actions),
    listTasks: vi.fn(async () => taskRecords),
    reconcileAction: vi.fn(async actionId => replaceAction(actionId, 'succeeded')),
    reject: vi.fn(async () => ({ ...waitingTask, state: 'cancelled' as const })),
    submitResearchBrief: vi.fn(async (
      question: string,
      sources: string[],
      id: string,
    ) => {
      const task: TaskRecord = {
        ...waitingTask,
        capabilityId: 'research-agent',
        channel: 'research-brief',
        content: question,
        contextRefs: [
          'lumi-workflow:research-brief/v1',
          ...sources.map(source =>
            `lumi-public-source:${Buffer.from(source).toString('base64url')}`,
          ),
        ],
        id,
        state: 'completed',
      }
      taskRecords = [task, ...taskRecords]
      return {
        approval: null,
        task,
      }
    }),
    submitTask: vi.fn(async (content, id) => {
      const task: TaskRecord = { ...waitingTask, content, id, state: 'completed' }
      taskRecords = [task, ...taskRecords]
      return { approval: null, task }
    }),
  }
}

function actionDetail(status: ActionStatus): ActionDetail {
  return {
    action: {
      actionDigest: 'a'.repeat(64),
      authorizationId: status === 'prepared' ? null : 'authorization-existing',
      cancellationRequestedAt: null,
      capability: {
        id: 'local-artifact',
        version: '1.0.0',
      },
      createdAt: '2026-09-25T09:00:00.000Z',
      deadline: '2026-09-25T10:00:00.000Z',
      effect: 'local_artifact',
      id: `action-${status}`,
      idempotencyKey: `idempotency-${status}`,
      inputDigest: 'b'.repeat(64),
      inputRef: `ledger://actions/action-${status}/input`,
      operation: 'artifact.write',
      ownerId: 'local-user',
      principalId: 'local-user',
      receiptId: null,
      revocationEpoch: 0,
      schemaVersion: 'lumi.action/v1',
      status,
      target: { artifactId: 'weekly-brief.md' },
      taskId: 'task-action',
      updatedAt: '2026-09-25T09:00:00.000Z',
      verificationId: null,
    },
    authorization: null,
    receipt: null,
    task: {
      ...waitingTask,
      channel: 'action-runtime',
      content: 'Prepare local artifact action',
      id: 'task-action',
      state: 'waiting_approval',
    },
    verification: null,
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

  it('submits a research brief with explicit source URLs', async () => {
    const api = fakeApi()
    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('tab', { name: '研究简报' }))
    fireEvent.change(screen.getByLabelText('研究问题'), {
      target: { value: 'Compare these sources' },
    })
    fireEvent.change(screen.getByLabelText('公开来源'), {
      target: { value: 'https://example.com\n\nhttps://example.org/report' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交研究简报' }))

    await waitFor(() => {
      expect(api.submitResearchBrief).toHaveBeenCalledWith(
        'Compare these sources',
        ['https://example.com', 'https://example.org/report'],
        expect.stringMatching(/^task_/),
      )
    })
    expect(await screen.findByRole('link', { name: 'https://example.com/' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://example.org/report' })).toBeTruthy()
  })

  it('shows bound action facts and refreshes after authorization', async () => {
    const prepared = actionDetail('prepared')
    const api = fakeApiWithActions([], [prepared])
    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('tab', { name: /动作/ }))

    expect(await screen.findByText(prepared.action.actionDigest)).toBeTruthy()
    expect(screen.getByText(prepared.action.inputDigest)).toBeTruthy()
    expect(screen.getByText('写入本地产物')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '执行动作' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '授权动作' }))

    await waitFor(() => {
      expect(api.authorizeAction).toHaveBeenCalledWith(prepared.action.id)
      expect(screen.getByRole('button', { name: '执行动作' })).toBeTruthy()
    })
  })

  it('only offers reconciliation for an unknown action outcome', async () => {
    const unknown = actionDetail('outcome_unknown')
    const api = fakeApiWithActions([], [unknown])
    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('tab', { name: /动作/ }))

    expect(await screen.findByRole('button', { name: '对账结果' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '执行动作' })).toBeNull()
    expect(screen.queryByRole('button', { name: '授权动作' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '对账结果' }))
    await waitFor(() => expect(api.reconcileAction).toHaveBeenCalledWith(unknown.action.id))
  })

  it('allows a prepared action to be cancelled before execution', async () => {
    const prepared = actionDetail('prepared')
    const api = fakeApiWithActions([], [prepared])
    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('tab', { name: /动作/ }))
    fireEvent.click(await screen.findByRole('button', { name: '取消动作' }))

    await waitFor(() => {
      expect(api.cancelAction).toHaveBeenCalledWith(prepared.action.id)
      expect(screen.queryByRole('button', { name: '授权动作' })).toBeNull()
    })
  })

  it('keeps action facts and restores controls after a command failure', async () => {
    const prepared = actionDetail('prepared')
    const api = fakeApiWithActions([], [prepared])
    api.authorizeAction = vi.fn(async () => {
      throw new Error('Authorization service unavailable')
    })
    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('tab', { name: /动作/ }))
    fireEvent.click(await screen.findByRole('button', { name: '授权动作' }))

    expect((await screen.findByRole('alert')).textContent)
      .toContain('Authorization service unavailable')
    expect(screen.getByText(prepared.action.actionDigest)).toBeTruthy()
    await waitFor(() => {
      expect((screen.getByRole('button', { name: '授权动作' }) as HTMLButtonElement).disabled)
        .toBe(false)
    })
  })
})
