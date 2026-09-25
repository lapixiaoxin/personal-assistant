import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionService } from '@lumi/action-runtime'
import {
  AssistantCore,
  type ExecutionInput,
  type TaskExecutor,
} from '@lumi/assistant-core'
import {
  createDefaultCapabilityRegistry,
  RuleBasedRouter,
} from '@lumi/capability-registry'
import {
  ActionDetailSchema,
  createTaskRequest,
  type ActionRecord,
  type JsonValue,
  type Principal,
} from '@lumi/contracts'
import { DefaultPolicyEngine } from '@lumi/policy'
import { SqliteTaskLedger } from '@lumi/task-ledger'
import { RecoveryService } from '../src/index.ts'
import type { RecoveryServiceError } from '../src/index.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('RecoveryService', () => {
  it('interrupts a safe meeting task and creates one explicit retry task', async () => {
    const execute = vi.fn(async () => ({ output: 'retried result' }))
    const { core, ledger, service } = harness(':memory:', { execute })
    runningTask(ledger, 'task-safe', 'meeting-agent', 'meeting-brief')

    const report = await service.initialize(principal())

    expect(report.detected).toBe(1)
    expect(execute).not.toHaveBeenCalled()
    const recovery = service.getForTask(principal(), 'task-safe')
    expect(recovery).toMatchObject({
      disposition: 'retry_available',
      safeToRetry: true,
      status: 'pending',
    })
    expect(ledger.getTask('task-safe')?.state).toBe('interrupted')

    const retried = await service.retry(principal(), recovery.id)
    expect(retried.recovery).toMatchObject({
      resolution: 'retried',
      status: 'resolved',
    })
    expect(retried.task).toMatchObject({
      result: 'retried result',
      state: 'completed',
    })
    expect(retried.task.id).not.toBe('task-safe')
    expect(ledger.getTask('task-safe')?.state).toBe('interrupted')
    expect(execute).toHaveBeenCalledOnce()
    await core.close()
  })

  it('requires manual review for coding and personal tasks with tool evidence', async () => {
    const { core, ledger, service } = harness(':memory:', {
      execute: async () => ({ output: 'must not run' }),
    })
    runningTask(ledger, 'task-coding', 'coding-agent', 'cli')
    runningTask(ledger, 'task-personal-tool', 'personal-assistant', 'web')
    ledger.appendEvent('task-personal-tool', 'tool.called', { name: 'lumi_action_prepare' })

    await service.initialize(principal())

    for (const taskId of ['task-coding', 'task-personal-tool']) {
      const recovery = service.getForTask(principal(), taskId)
      expect(recovery).toMatchObject({
        disposition: 'manual_review',
        safeToRetry: false,
      })
      await expect(service.retry(principal(), recovery.id)).rejects.toMatchObject({
        code: 'RETRY_NOT_ALLOWED',
      } satisfies Partial<RecoveryServiceError>)
    }
    await core.close()
  })

  it('dispatches normal queued tasks but leaves action tasks unconsumed', async () => {
    const execute = vi.fn(async ({ task }: ExecutionInput) => ({ output: task.id }))
    const { core, ledger, service } = harness(':memory:', { execute })
    ledger.createTask(createTaskRequest({
      actorId: principal().id,
      channel: 'http',
      content: 'Summarize queued work',
      id: 'task-queued-normal',
    }))
    ledger.createTask(createTaskRequest({
      actorId: principal().id,
      channel: 'action-runtime',
      content: 'artifact.write queued',
      id: 'task-queued-action',
    }))

    const report = await service.initialize(principal())

    expect(report.queuedDispatched).toBe(1)
    expect(ledger.getTask('task-queued-normal')?.state).toBe('completed')
    expect(ledger.getTask('task-queued-action')?.state).toBe('queued')
    expect(execute).toHaveBeenCalledOnce()
    await core.close()
  })

  it('moves an executing action to reconciliation and resolves only after read-back', async () => {
    const { core, ledger } = harness(':memory:', {
      execute: async () => ({ output: 'unused' }),
    })
    const action = prepareExecutingAction(ledger)
    const reconcile = vi.fn(async () => {
      ledger.recordActionSucceeded({
        actionId: action.id,
        artifactRef: 'file:///tmp/recovered',
        contentDigest: action.inputDigest,
        providerVersion: 'test-provider/1',
        recovered: true,
      })
      ledger.recordVerification({
        actionId: action.id,
        evidenceRefs: ['file:///tmp/recovered'],
        expectedDigest: action.inputDigest,
        observedDigest: action.inputDigest,
        reason: 'Recovered artifact matches',
        status: 'passed',
        verifierVersion: 'test-verifier/1',
      })
      return ActionDetailSchema.parse({
        action: ledger.getAction(action.id),
        authorization: ledger.getAuthorizationForAction(action.id),
        receipt: ledger.getReceiptForAction(action.id),
        task: ledger.getTask(action.taskId),
        verification: ledger.getVerificationForAction(action.id),
      })
    })
    const service = new RecoveryService({
      actions: { reconcile } as Pick<ActionService, 'reconcile'>,
      core,
      ledger,
    })

    await service.initialize(principal())

    expect(ledger.getAction(action.id)?.status).toBe('outcome_unknown')
    expect(ledger.getTask(action.taskId)?.state).toBe('reconciling')
    const recovery = service.getForTask(principal(), action.taskId)
    await expect(service.retry(principal(), recovery.id)).rejects.toMatchObject({
      code: 'RETRY_NOT_ALLOWED',
    } satisfies Partial<RecoveryServiceError>)

    const detail = await service.reconcileAction(principal(), action.id)
    expect(detail).toMatchObject({
      action: { status: 'succeeded' },
      receipt: { recovered: true },
      task: { state: 'completed' },
      verification: { status: 'passed' },
    })
    expect(service.get(principal(), recovery.id)).toMatchObject({
      resolution: 'reconciled',
      status: 'resolved',
    })
    expect(reconcile).toHaveBeenCalledOnce()
    await core.close()
  })

  it('continues one persisted retry claim after reopening the database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-recovery-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    const first = harness(filename, {
      execute: async () => ({ output: 'unused' }),
    })
    runningTask(first.ledger, 'task-retry-claim', 'meeting-agent', 'meeting-brief')
    await first.service.initialize(principal())
    const recovery = first.service.getForTask(principal(), 'task-retry-claim')
    first.ledger.claimRecoveryRetry({
      recoveryId: recovery.id,
      replacementCreatedAt: '2026-09-25T10:05:00.000Z',
      replacementTaskId: 'task-stable-replacement',
    }, principal())
    await first.core.close()

    const execute = vi.fn(async () => ({ output: 'continued after restart' }))
    const second = harness(filename, { execute })
    const report = await second.service.initialize(principal())

    expect(report.retryClaimsRecovered).toBe(1)
    expect(second.service.get(principal(), recovery.id)).toMatchObject({
      replacementTaskId: 'task-stable-replacement',
      resolution: 'retried',
      status: 'resolved',
    })
    expect(second.ledger.getTask('task-stable-replacement')).toMatchObject({
      result: 'continued after restart',
      state: 'completed',
    })
    expect(execute).toHaveBeenCalledOnce()
    await second.core.close()
  })

  it('does not recover tasks owned by another live local runtime', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-recovery-owner-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    const first = harness(filename, {
      execute: async () => ({ output: 'first runtime' }),
    })
    await first.service.initialize(principal())
    runningTask(first.ledger, 'task-live-runtime', 'meeting-agent', 'meeting-brief')

    const second = harness(filename, {
      execute: async () => ({ output: 'second runtime' }),
    })
    await expect(second.service.initialize(principal())).resolves.toMatchObject({
      detected: 0,
      skippedActiveRuntime: true,
    })
    expect(second.ledger.getTask('task-live-runtime')?.state).toBe('running')

    await first.core.close()
    await expect(second.service.initialize(principal())).resolves.toMatchObject({
      detected: 1,
      skippedActiveRuntime: false,
    })
    expect(second.ledger.getTask('task-live-runtime')?.state).toBe('interrupted')
    await second.core.close()
  })

  it('rejects a replacement id bound to a different persisted request', async () => {
    const execute = vi.fn(async () => ({ output: 'must not run' }))
    const { core, ledger, service } = harness(':memory:', { execute })
    runningTask(ledger, 'task-retry-conflict', 'meeting-agent', 'meeting-brief')
    await service.initialize(principal())
    const recovery = service.getForTask(principal(), 'task-retry-conflict')
    ledger.claimRecoveryRetry({
      recoveryId: recovery.id,
      replacementCreatedAt: '2026-09-25T10:05:00.000Z',
      replacementTaskId: 'task-conflicting-replacement',
    }, principal())
    ledger.createTask(createTaskRequest({
      actorId: principal().id,
      channel: 'meeting-brief',
      content: 'Different persisted request',
      createdAt: '2026-09-25T10:05:00.000Z',
      id: 'task-conflicting-replacement',
    }))

    await expect(service.retry(principal(), recovery.id)).rejects.toMatchObject({
      code: 'RECOVERY_CONFLICT',
    } satisfies Partial<RecoveryServiceError>)
    expect(execute).not.toHaveBeenCalled()
    expect(service.get(principal(), recovery.id).status).toBe('retrying')
    await core.close()
  })
})

function harness(filename: string, executor: TaskExecutor) {
  const ledger = new SqliteTaskLedger({
    filename,
    now: () => '2026-09-25T10:00:00.000Z',
  })
  const core = new AssistantCore(
    ledger,
    new RuleBasedRouter(createDefaultCapabilityRegistry()),
    new DefaultPolicyEngine(),
    executor,
  )
  const service = new RecoveryService({
    actions: {
      reconcile: async () => {
        throw new Error('Unexpected reconcile call')
      },
    } as Pick<ActionService, 'reconcile'>,
    core,
    ledger,
    now: () => '2026-09-25T10:05:00.000Z',
  })
  return { core, ledger, service }
}

function principal(): Principal {
  return {
    authStrength: 'local_process',
    id: 'local-user',
    kind: 'owner',
    ownerId: 'local-owner',
  }
}

function runningTask(
  ledger: SqliteTaskLedger,
  taskId: string,
  capabilityId: string,
  channel: string,
): void {
  ledger.createTask(createTaskRequest({
    actorId: principal().id,
    channel,
    content: `Recover ${taskId}`,
    createdAt: '2026-09-25T09:55:00.000Z',
    id: taskId,
  }))
  ledger.transitionTask(taskId, ['queued'], 'running', { capabilityId })
  ledger.appendEvent(taskId, 'execution.started', { capabilityId })
}

function prepareExecutingAction(ledger: SqliteTaskLedger): ActionRecord {
  const content = 'recover this artifact'
  const inputDigest = digest(content)
  const action: ActionRecord = {
    actionDigest: digest(JSON.stringify(sortJson({
      capability: { id: 'local-artifact', version: '1.0.0' },
      deadline: null,
      effect: 'local_artifact',
      idempotencyKey: 'recovery-action',
      inputDigest,
      operation: 'artifact.write',
      ownerId: principal().ownerId,
      principalId: principal().id,
      target: { artifactId: 'recovery-artifact' },
    }))),
    authorizationId: null,
    cancellationRequestedAt: null,
    capability: { id: 'local-artifact', version: '1.0.0' },
    createdAt: '2026-09-25T10:00:00.000Z',
    deadline: null,
    effect: 'local_artifact',
    id: 'action-recovery',
    idempotencyKey: 'recovery-action',
    inputDigest,
    inputRef: 'action-input:action-recovery',
    operation: 'artifact.write',
    ownerId: principal().ownerId,
    principalId: principal().id,
    receiptId: null,
    revocationEpoch: 0,
    schemaVersion: 'lumi.action/v1',
    status: 'prepared',
    target: { artifactId: 'recovery-artifact' },
    taskId: 'task-action-recovery',
    updatedAt: '2026-09-25T10:00:00.000Z',
    verificationId: null,
  }
  ledger.prepareAction({
    action,
    content,
    task: createTaskRequest({
      actorId: principal().id,
      channel: 'action-runtime',
      content: 'artifact.write recovery-artifact',
      createdAt: '2026-09-25T10:00:00.000Z',
      id: action.taskId,
    }),
  })
  ledger.authorizeAction(
    action.id,
    principal(),
    '2026-09-25T10:10:00.000Z',
    'local-action-policy/1',
  )
  return ledger.claimActionExecution(action.id, principal())
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, sortJson(child)]),
    )
  }
  return value
}
