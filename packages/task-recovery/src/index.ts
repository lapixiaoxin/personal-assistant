import type { ActionService } from '@lumi/action-runtime'
import type { AssistantCore } from '@lumi/assistant-core'
import {
  createId,
  RecoveryListQuerySchema,
  RecoveryRetryResultSchema,
  type ActionDetail,
  type Principal,
  type RecoveryListQuery,
  type RecoveryRecord,
  type RecoveryRetryResult,
  type TaskEvent,
  type TaskRecord,
  type TaskRequest,
} from '@lumi/contracts'
import type {
  ActionLedger,
  RecoveryLedger,
  TaskLedger,
} from '@lumi/task-ledger'

export type RecoveryErrorCode =
  | 'RECOVERY_CONFLICT'
  | 'RECOVERY_NOT_FOUND'
  | 'RETRY_NOT_ALLOWED'

export class RecoveryServiceError extends Error {
  constructor(
    readonly code: RecoveryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RecoveryServiceError'
  }
}

export interface RecoveryStartupReport {
  detected: number
  pending: number
  queuedDispatchFailures: number
  queuedDispatched: number
  retryClaimsRecovered: number
  skippedActiveRuntime: boolean
}

export interface RecoveryServiceOptions {
  actions: Pick<ActionService, 'reconcile'>
  core: AssistantCore
  isProcessAlive?: (pid: number) => boolean
  ledger: ActionLedger & RecoveryLedger & TaskLedger
  now?: () => string
  pid?: number
  runtimeId?: string
}

const effectEvidence = new Set([
  'action.executing',
  'action.outcome_unknown',
  'action.prepared',
  'action.succeeded',
  'tool.called',
])

export class RecoveryService {
  readonly #isProcessAlive: (pid: number) => boolean
  readonly #now: () => string
  readonly #pid: number
  readonly #runtimeId: string

  constructor(private readonly options: RecoveryServiceOptions) {
    this.#isProcessAlive = options.isProcessAlive ?? isLocalProcessAlive
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#pid = options.pid ?? process.pid
    this.#runtimeId = options.runtimeId ?? createId('runtime')
  }

  async initialize(principal: Principal): Promise<RecoveryStartupReport> {
    const currentLease = this.options.ledger.getRuntimeRecoveryLease()
    if (currentLease && this.#isProcessAlive(currentLease.pid)) {
      return emptyStartupReport(true)
    }
    const claimed = this.options.ledger.claimRuntimeRecoveryLease({
      expectedRuntimeId: currentLease?.runtimeId ?? null,
      pid: this.#pid,
      runtimeId: this.#runtimeId,
      startedAt: this.#now(),
    })
    if (!claimed) return emptyStartupReport(true)

    let detected = 0
    const initialTasks = this.options.ledger.listTasksForRecovery(principal.id)
    for (const task of initialTasks) {
      if (task.state !== 'running') continue
      this.#recordInterruptedTask(principal, task)
      detected += 1
    }

    let retryClaimsRecovered = 0
    const retrying = this.options.ledger.listRecoveries(principal, {
      limit: 200,
      status: 'retrying',
    })
    for (const recovery of retrying) {
      try {
        await this.#completeRetry(principal, recovery)
        retryClaimsRecovered += 1
      } catch (error) {
        this.#auditStartupFailure(principal, recovery.taskId, 'retry_claim', error)
      }
    }

    let queuedDispatched = 0
    let queuedDispatchFailures = 0
    const queued = this.options.ledger.listTasksForRecovery(principal.id)
      .filter(task => task.state === 'queued' && task.channel !== 'action-runtime')
    for (const task of queued) {
      try {
        await this.options.core.resumeQueued(task.id)
        queuedDispatched += 1
      } catch (error) {
        queuedDispatchFailures += 1
        this.#auditStartupFailure(principal, task.id, 'queued_dispatch', error)
      }
    }

    return {
      detected,
      pending: this.options.ledger.listRecoveries(principal, {
        limit: 200,
        status: 'pending',
      }).length,
      queuedDispatchFailures,
      queuedDispatched,
      retryClaimsRecovered,
      skippedActiveRuntime: false,
    }
  }

  get(principal: Principal, recoveryId: string): RecoveryRecord {
    const recovery = this.options.ledger.getRecovery(recoveryId, principal)
    if (!recovery) {
      throw new RecoveryServiceError(
        'RECOVERY_NOT_FOUND',
        `Recovery not found: ${recoveryId}`,
      )
    }
    return recovery
  }

  getForTask(principal: Principal, taskId: string): RecoveryRecord {
    const recovery = this.options.ledger.getRecoveryForTask(taskId, principal)
    if (!recovery) {
      throw new RecoveryServiceError(
        'RECOVERY_NOT_FOUND',
        `Recovery not found for task: ${taskId}`,
      )
    }
    return recovery
  }

  list(
    principal: Principal,
    query: Partial<RecoveryListQuery> = {},
  ): RecoveryRecord[] {
    const parsed = RecoveryListQuerySchema.parse(query)
    return this.options.ledger.listRecoveries(principal, {
      limit: parsed.limit,
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.taskId ? { taskId: parsed.taskId } : {}),
    })
  }

  acknowledge(principal: Principal, recoveryId: string): RecoveryRecord {
    const recovery = this.get(principal, recoveryId)
    if (recovery.status !== 'pending' || recovery.disposition === 'reconcile_action') {
      throw new RecoveryServiceError(
        'RECOVERY_CONFLICT',
        'This recovery cannot be acknowledged in its current state',
      )
    }
    return this.options.ledger.resolveRecovery(recovery.id, principal, 'acknowledged')
  }

  async retry(principal: Principal, recoveryId: string): Promise<RecoveryRetryResult> {
    let recovery = this.get(principal, recoveryId)
    if (recovery.status === 'resolved') {
      if (recovery.resolution !== 'retried' || !recovery.replacementTaskId) {
        throw new RecoveryServiceError(
          'RECOVERY_CONFLICT',
          `Recovery ${recovery.id} is already resolved`,
        )
      }
      const replacement = this.options.ledger.getTask(recovery.replacementTaskId)
      if (!replacement) {
        throw new RecoveryServiceError(
          'RECOVERY_CONFLICT',
          'The resolved replacement task is missing',
        )
      }
      const original = this.options.ledger.getTask(recovery.taskId)
      if (!original || !matchesRetryRequest(original, recovery, replacement)) {
        throw new RecoveryServiceError(
          'RECOVERY_CONFLICT',
          'The resolved replacement task does not match its recovery claim',
        )
      }
      return RecoveryRetryResultSchema.parse({ recovery, task: replacement })
    }
    if (recovery.status === 'pending') {
      if (recovery.disposition !== 'retry_available' || !recovery.safeToRetry) {
        throw new RecoveryServiceError(
          'RETRY_NOT_ALLOWED',
          'This interrupted task may have produced effects and cannot be retried automatically',
        )
      }
      recovery = this.options.ledger.claimRecoveryRetry({
        recoveryId: recovery.id,
        replacementCreatedAt: this.#now(),
        replacementTaskId: createId('task'),
      }, principal)
    }
    return this.#completeRetry(principal, recovery)
  }

  async reconcileAction(principal: Principal, actionId: string): Promise<ActionDetail> {
    const action = this.options.ledger.getAction(actionId)
    const recovery = action
      ? this.options.ledger.getRecoveryForTask(action.taskId, principal)
      : undefined
    const detail = await this.options.actions.reconcile(principal, actionId)
    if (
      recovery?.disposition === 'reconcile_action'
      && recovery.status !== 'resolved'
      && (detail.task.state === 'completed' || detail.task.state === 'failed')
    ) {
      this.options.ledger.resolveRecovery(recovery.id, principal, 'reconciled')
    }
    return detail
  }

  #recordInterruptedTask(principal: Principal, task: TaskRecord): RecoveryRecord {
    const action = this.options.ledger.getActionForTask(task.id)
    if (
      action
      && (
        action.status === 'executing'
        || action.status === 'outcome_unknown'
        || (
          action.status === 'succeeded'
          && !this.options.ledger.getVerificationForAction(action.id)
        )
      )
    ) {
      const recovery = this.options.ledger.recordTaskRecovery({
        actionId: action.id,
        disposition: 'reconcile_action',
        ownerId: principal.ownerId,
        principalId: principal.id,
        reasonCode: action.status === 'succeeded'
          ? 'ACTION_VERIFICATION_PENDING'
          : 'ACTION_OUTCOME_UNKNOWN',
        safeToRetry: false,
        taskId: task.id,
      })
      this.#auditDetection(principal, recovery)
      return recovery
    }

    const retryAvailable = isSafeTaskRetry(task, this.options.ledger.listEvents(task.id))
    const recovery = this.options.ledger.recordTaskRecovery({
      disposition: retryAvailable ? 'retry_available' : 'manual_review',
      ownerId: principal.ownerId,
      principalId: principal.id,
      reasonCode: retryAvailable
        ? 'HOST_RESTART_SAFE_TO_RETRY'
        : 'HOST_RESTART_EFFECT_MAY_HAVE_OCCURRED',
      safeToRetry: retryAvailable,
      taskId: task.id,
    })
    this.#auditDetection(principal, recovery)
    return recovery
  }

  async #completeRetry(
    principal: Principal,
    recovery: RecoveryRecord,
  ): Promise<RecoveryRetryResult> {
    if (
      recovery.status !== 'retrying'
      || !recovery.replacementTaskId
      || !recovery.replacementCreatedAt
    ) {
      throw new RecoveryServiceError(
        'RECOVERY_CONFLICT',
        'The recovery does not have a persisted retry claim',
      )
    }
    const original = this.options.ledger.getTask(recovery.taskId)
    if (!original) {
      throw new RecoveryServiceError(
        'RECOVERY_CONFLICT',
        `Original task not found: ${recovery.taskId}`,
      )
    }

    let replacement = this.options.ledger.getTask(recovery.replacementTaskId)
    if (replacement && !matchesRetryRequest(original, recovery, replacement)) {
      throw new RecoveryServiceError(
        'RECOVERY_CONFLICT',
        'The persisted replacement task does not match its recovery claim',
      )
    }
    try {
      if (replacement?.state === 'queued') {
        replacement = await this.options.core.resumeQueued(replacement.id)
      } else if (!replacement) {
        replacement = await this.options.core.submit({
          actorId: original.actorId,
          channel: original.channel,
          content: original.content,
          contextRefs: original.contextRefs,
          createdAt: recovery.replacementCreatedAt,
          id: recovery.replacementTaskId,
        })
      }
    } catch (error) {
      replacement = this.options.ledger.getTask(recovery.replacementTaskId)
      if (!replacement) {
        this.options.ledger.releaseRecoveryRetry(recovery.id, principal)
        throw error
      }
      if (!matchesRetryRequest(original, recovery, replacement)) {
        throw new RecoveryServiceError(
          'RECOVERY_CONFLICT',
          'The persisted replacement task does not match its recovery claim',
        )
      }
    }

    if (!replacement) {
      throw new RecoveryServiceError(
        'RECOVERY_CONFLICT',
        'The retry did not create a replacement task',
      )
    }
    const resolved = this.options.ledger.resolveRecovery(
      recovery.id,
      principal,
      'retried',
    )
    return RecoveryRetryResultSchema.parse({
      recovery: resolved,
      task: replacement,
    })
  }

  #auditDetection(principal: Principal, recovery: RecoveryRecord): void {
    this.options.ledger.appendAudit({
      action: 'recovery.detect',
      actorId: principal.id,
      detail: {
        actionId: recovery.actionId,
        disposition: recovery.disposition,
        reasonCode: recovery.reasonCode,
        recoveryId: recovery.id,
        safeToRetry: recovery.safeToRetry,
      },
      outcome: 'requested',
      targetId: recovery.taskId,
    })
  }

  #auditStartupFailure(
    principal: Principal,
    taskId: string,
    phase: string,
    error: unknown,
  ): void {
    this.options.ledger.appendAudit({
      action: 'recovery.startup',
      actorId: principal.id,
      detail: {
        error: error instanceof Error ? error.message : String(error),
        phase,
      },
      outcome: 'failed',
      targetId: taskId,
    })
  }
}

export function isSafeTaskRetry(task: TaskRecord, events: readonly TaskEvent[]): boolean {
  if (task.capabilityId === 'meeting-agent' || task.capabilityId === 'research-agent') {
    return true
  }
  if (task.capabilityId !== 'personal-assistant') return false
  return !events.some(event => effectEvidence.has(event.type))
}

function emptyStartupReport(skippedActiveRuntime: boolean): RecoveryStartupReport {
  return {
    detected: 0,
    pending: 0,
    queuedDispatchFailures: 0,
    queuedDispatched: 0,
    retryClaimsRecovered: 0,
    skippedActiveRuntime,
  }
}

function isLocalProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function matchesRetryRequest(
  original: TaskRecord,
  recovery: RecoveryRecord,
  replacement: TaskRequest,
): boolean {
  return replacement.id === recovery.replacementTaskId
    && replacement.createdAt === recovery.replacementCreatedAt
    && replacement.actorId === original.actorId
    && replacement.channel === original.channel
    && replacement.content === original.content
    && JSON.stringify(replacement.contextRefs) === JSON.stringify(original.contextRefs)
}
