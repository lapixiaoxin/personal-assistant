import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionInput } from '@lumi/assistant-core'
import { createTaskRequest } from '@lumi/contracts'
import { SqliteTaskLedger } from '@lumi/task-ledger'
import { createAssistantRuntime, resolveDshModelConfiguration } from '../src/index.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('runtime composition', () => {
  it('uses DSH by default without starting it eagerly', async () => {
    vi.stubEnv('PA_EXECUTOR', undefined)
    const runtime = createAssistantRuntime({ dbPath: ':memory:' })

    expect(runtime.executorKind).toBe('dsh')
    await runtime.close()
  })

  it('requires an explicit switch to use the mock executor', async () => {
    vi.stubEnv('PA_EXECUTOR', 'mock')
    const runtime = createAssistantRuntime({ dbPath: ':memory:' })

    expect(runtime.executorKind).toBe('mock')
    await runtime.close()
  })

  it('selects the matching built-in MiniMax catalog from the available key', () => {
    expect(resolveDshModelConfiguration({
      MINIMAX_CN_API_KEY: 'redacted',
    })).toEqual({
      model: 'MiniMax-M3',
      provider: 'minimax-cn',
      providerPatchFiles: ['profiles/providers/minimax-cn.patch.yml'],
    })
    expect(resolveDshModelConfiguration({
      MINIMAX_API_KEY: 'redacted',
    })).toEqual({
      model: 'MiniMax-M3',
      provider: 'minimax',
      providerPatchFiles: ['profiles/providers/minimax.patch.yml'],
    })
  })

  it('persists personal memory and injects only a temporary task context', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-runtime-memory-'))
    temporaryDirectories.push(directory)
    const dbPath = join(directory, 'assistant.db')
    let execution: ExecutionInput | undefined
    const first = createAssistantRuntime({
      dbPath,
      executor: {
        async execute(input) {
          execution = input
          return { output: 'done' }
        },
      },
      ownerId: 'owner-one',
      principalId: 'user-one',
    })
    const memory = first.memories.create(first.identity.localPrincipal(), {
      content: 'Prefer concise answers',
    })
    const task = {
      actorId: 'user-one',
      channel: 'test',
      content: 'Summarize this plan',
      contextRefs: [],
      createdAt: '2026-09-25T10:00:00.000Z',
      id: 'task-memory-runtime',
    }

    await first.core.submit(task)

    expect(execution?.task.content).toContain('Prefer concise answers')
    expect(first.ledger.getTask(task.id)?.content).toBe('Summarize this plan')
    const contextEvent = first.ledger.listEvents(task.id)
      .find(event => event.type === 'memory.context_attached')
    expect(contextEvent?.payload).toEqual({
      count: 1,
      memories: [{ id: memory.id, revision: 1 }],
      purpose: 'general_assistance',
    })
    expect(JSON.stringify(contextEvent)).not.toContain('Prefer concise answers')
    await first.close()

    const reopened = createAssistantRuntime({
      dbPath,
      executor: { execute: async () => ({ output: 'done' }) },
      ownerId: 'owner-one',
      principalId: 'user-one',
    })
    expect(reopened.memories.get(reopened.identity.localPrincipal(), memory.id))
      .toMatchObject({ content: 'Prefer concise answers', revision: 1 })
    await reopened.close()
  })

  it('finishes startup recovery before exposing an interrupted task', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-runtime-recovery-'))
    temporaryDirectories.push(directory)
    const dbPath = join(directory, 'assistant.db')
    const seed = new SqliteTaskLedger({ filename: dbPath })
    const request = createTaskRequest({
      actorId: 'user-one',
      channel: 'meeting-brief',
      content: 'Prepare a restart-safe meeting',
      id: 'task-runtime-interrupted',
    })
    seed.createTask(request)
    seed.transitionTask(request.id, ['queued'], 'running', {
      capabilityId: 'meeting-agent',
    })
    seed.appendEvent(request.id, 'execution.started', {
      capabilityId: 'meeting-agent',
    })
    seed.close()
    const execute = vi.fn(async () => ({ output: 'must wait for explicit retry' }))
    const runtime = createAssistantRuntime({
      dbPath,
      executor: { execute },
      ownerId: 'owner-one',
      principalId: 'user-one',
    })

    await expect(runtime.ready).resolves.toMatchObject({
      detected: 1,
      pending: 1,
    })
    expect(runtime.core.getTask(request.id)?.state).toBe('interrupted')
    expect(runtime.recovery.getForTask(
      runtime.identity.localPrincipal(),
      request.id,
    )).toMatchObject({
      disposition: 'retry_available',
      status: 'pending',
    })
    expect(execute).not.toHaveBeenCalled()
    await runtime.close()
  })
})
