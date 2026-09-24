import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultCapabilityRegistry,
  RuleBasedRouter,
} from '@personal-assistant/capability-registry'
import { createTaskRequest } from '@personal-assistant/contracts'
import { DefaultPolicyEngine } from '@personal-assistant/policy'
import { SqliteTaskLedger } from '@personal-assistant/task-ledger'
import {
  AssistantCore,
  TaskIdConflictError,
  type ExecutionInput,
  type TaskExecutor,
} from './index.ts'

function createCore(executor: TaskExecutor): {
  core: AssistantCore
  ledger: SqliteTaskLedger
} {
  const ledger = new SqliteTaskLedger({ filename: ':memory:' })
  const registry = createDefaultCapabilityRegistry()
  return {
    core: new AssistantCore(
      ledger,
      new RuleBasedRouter(registry),
      new DefaultPolicyEngine(),
      executor,
    ),
    ledger,
  }
}

describe('AssistantCore', () => {
  it('routes coding tasks and persists the complete lifecycle', async () => {
    const execute = vi.fn(async (input: ExecutionInput) => {
      input.emit({ kind: 'tool.called', callId: 'call-1', name: 'edit' })
      input.emit({ kind: 'tool.completed', callId: 'call-1', isError: false, name: 'edit' })
      return { output: 'Implemented', sessionId: 'dsh-session-1' }
    })
    const { core, ledger } = createCore({ execute })
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'cli',
      content: 'Implement the TypeScript API',
      id: 'task-coding',
    })

    const result = await core.submit(request)

    expect(result).toMatchObject({
      capabilityId: 'coding-agent',
      dshSessionId: 'dsh-session-1',
      result: 'Implemented',
      state: 'completed',
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(ledger.listEvents(request.id).map((event) => event.type)).toEqual([
      'task.created',
      'routing.selected',
      'policy.evaluated',
      'task.state_changed',
      'execution.started',
      'tool.called',
      'tool.completed',
      'execution.completed',
      'task.state_changed',
    ])
    expect(ledger.listAudit(request.id).map((record) => record.action)).toEqual([
      'task.submit',
      'policy.evaluate',
      'execution.start',
      'tool.call',
      'tool.complete',
      'execution.complete',
    ])
    await core.close()
  })

  it('blocks external actions until an explicit approval', async () => {
    const execute = vi.fn(async () => ({ output: 'Sent', sessionId: 'dsh-session-2' }))
    const { core, ledger } = createCore({ execute })
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'http',
      content: 'Send this update by email',
      id: 'task-approval',
    })

    const waiting = await core.submit(request)
    expect(waiting.state).toBe('waiting_approval')
    expect(execute).not.toHaveBeenCalled()

    const completed = await core.approve(request.id, 'user-1')
    expect(completed.state).toBe('completed')
    expect(execute).toHaveBeenCalledOnce()
    expect(ledger.getApprovalForTask(request.id)).toMatchObject({
      decidedBy: 'user-1',
      status: 'approved',
    })
    await core.close()
  })

  it('treats a matching task id as idempotent and rejects conflicting reuse', async () => {
    const execute = vi.fn(async () => ({ output: 'Done' }))
    const { core } = createCore({ execute })
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'cli',
      content: 'Summarize this',
      createdAt: '2026-09-24T10:00:00.000Z',
      id: 'task-idempotent',
    })

    await core.submit(request)
    await core.submit(request)
    expect(execute).toHaveBeenCalledOnce()

    await expect(core.submit({
      ...request,
      content: 'Different request',
    })).rejects.toThrow(TaskIdConflictError)
    await core.close()
  })

  it('cancels an active task and discards a late result', async () => {
    const executor: TaskExecutor = {
      execute: (input) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ output: 'Too late' }), 100)
        input.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        }, { once: true })
      }),
    }
    const { core } = createCore(executor)
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'http',
      content: 'Summarize the file',
      id: 'task-cancel',
    })

    const pending = core.submit(request)
    const cancelled = core.cancel(request.id, 'user-1')
    expect(cancelled.state).toBe('cancelled')
    await expect(pending).resolves.toMatchObject({ state: 'cancelled' })
    await core.close()
  })
})
