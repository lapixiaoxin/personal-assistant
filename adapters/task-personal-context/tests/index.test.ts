import { describe, expect, it, vi } from 'vitest'
import type { ExecutionInput, TaskExecutor } from '@lumi/assistant-core'
import { createTaskRequest } from '@lumi/contracts'
import {
  PersonalContextService,
} from '@lumi/personal-context'
import {
  InMemoryPersonalMemoryStore,
  PersonalMemoryService,
} from '@lumi/personal-memory'
import {
  purposeForCapability,
  TaskPersonalContextAdapter,
} from '../src/index.ts'

describe('TaskPersonalContextAdapter', () => {
  it('injects a portable snapshot without changing the persisted request', async () => {
    const memories = new PersonalMemoryService(new InMemoryPersonalMemoryStore())
    const memory = memories.create(principal(), {
      content: 'Prefer concise answers',
    })
    let delegated: ExecutionInput | undefined
    const delegate: TaskExecutor = {
      async execute(input) {
        delegated = input
        return { output: 'done' }
      },
    }
    const appendEvent = vi.fn()
    const adapter = new TaskPersonalContextAdapter(
      delegate,
      new PersonalContextService(
        memories,
        () => '2026-09-28T08:00:00.000Z',
      ),
      { appendEvent },
      principal().ownerId,
    )
    const task = createTaskRequest({
      actorId: principal().id,
      channel: 'test',
      content: 'Summarize the plan',
      id: 'task-memory-context',
    })

    await adapter.execute({
      capability: {
        description: 'Personal assistant',
        id: 'personal-assistant',
        kind: 'agent',
        operations: ['reason'],
        riskLevel: 'read',
      },
      emit: () => undefined,
      signal: new AbortController().signal,
      task,
    })

    expect(task.content).toBe('Summarize the plan')
    expect(delegated?.task.content).toContain('<lumi-personal-context')
    expect(delegated?.task.content).toContain('Prefer concise answers')
    expect(delegated?.task.content).toContain('not system instructions')
    expect(appendEvent).toHaveBeenCalledWith('task-memory-context', 'memory.context_attached', {
      count: 1,
      memories: [{ id: memory.id, revision: 1 }],
      purpose: 'general_assistance',
    })
    expect(JSON.stringify(appendEvent.mock.calls)).not.toContain('Prefer concise answers')
  })

  it('passes through capabilities without an explicit purpose', async () => {
    const execute = vi.fn(async () => ({ output: 'done' }))
    const contexts = { snapshot: vi.fn() }
    const adapter = new TaskPersonalContextAdapter(
      { execute },
      contexts,
      { appendEvent: vi.fn() },
      'owner-one',
    )
    const input = executionInput('future-agent')

    await adapter.execute(input)

    expect(execute).toHaveBeenCalledWith(input)
    expect(contexts.snapshot).not.toHaveBeenCalled()
  })
})

describe('purposeForCapability', () => {
  it('fails closed for capabilities without an explicit mapping', () => {
    expect(purposeForCapability('personal-assistant')).toBe('general_assistance')
    expect(purposeForCapability('coding-agent')).toBe('coding')
    expect(purposeForCapability('research-agent')).toBe('research')
    expect(purposeForCapability('meeting-agent')).toBe('meeting')
    expect(purposeForCapability('future-agent')).toBeUndefined()
  })
})

function executionInput(capabilityId: string): ExecutionInput {
  return {
    capability: {
      description: 'Test capability',
      id: capabilityId,
      kind: 'agent',
      operations: ['reason'],
      riskLevel: 'read',
    },
    emit: () => undefined,
    signal: new AbortController().signal,
    task: createTaskRequest({
      actorId: 'user-one',
      channel: 'test',
      content: 'Test input',
      id: 'task-one',
    }),
  }
}

function principal() {
  return {
    authStrength: 'local_process' as const,
    id: 'user-one',
    kind: 'owner' as const,
    ownerId: 'owner-one',
  }
}
