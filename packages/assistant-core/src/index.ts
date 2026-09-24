import type { TaskRouter } from '@lumi/capability-registry'
import {
  TaskRequestSchema,
  type CapabilityDescriptor,
  type JsonValue,
  type TaskRecord,
  type TaskRequest,
} from '@lumi/contracts'
import type { PolicyEngine } from '@lumi/policy'
import type { TaskLedger } from '@lumi/task-ledger'

export type ExecutionEvent =
  | { kind: 'progress'; message: string }
  | { kind: 'tool.called'; callId?: string; name: string }
  | { kind: 'tool.completed'; callId?: string; isError: boolean; name?: string }

export interface ExecutionInput {
  capability: CapabilityDescriptor
  emit: (event: ExecutionEvent) => void
  signal: AbortSignal
  task: TaskRequest
}

export interface ExecutionResult {
  output: string
  sessionId?: string
}

export interface TaskExecutor {
  close?(): Promise<void>
  execute(input: ExecutionInput): Promise<ExecutionResult>
}

export class TaskIdConflictError extends Error {
  constructor(readonly taskId: string) {
    super(`Task id ${taskId} is already bound to a different request`)
    this.name = 'TaskIdConflictError'
  }
}

export class AssistantCore {
  readonly #controllers = new Map<string, AbortController>()

  constructor(
    private readonly ledger: TaskLedger,
    private readonly router: TaskRouter,
    private readonly policy: PolicyEngine,
    private readonly executor: TaskExecutor,
  ) {}

  async submit(input: TaskRequest): Promise<TaskRecord> {
    const request = TaskRequestSchema.parse(input)
    const existing = this.ledger.getTask(request.id)
    if (existing) {
      if (!sameRequest(existing, request)) throw new TaskIdConflictError(request.id)
      return existing
    }

    let task = this.ledger.createTask(request)
    this.ledger.appendAudit({
      action: 'task.submit',
      actorId: request.actorId,
      detail: { channel: request.channel },
      outcome: 'allowed',
      targetId: request.id,
    })

    try {
      const route = this.router.route(request)
      this.ledger.appendEvent(request.id, 'routing.selected', {
        capabilityId: route.capability.id,
        reason: route.reason,
      })
      const decision = this.policy.evaluate(request, route.capability)
      this.ledger.appendEvent(request.id, 'policy.evaluated', {
        action: decision.action,
        reason: decision.reason,
        riskLevel: decision.riskLevel,
        ruleId: decision.ruleId,
      })
      this.ledger.appendAudit({
        action: 'policy.evaluate',
        actorId: request.actorId,
        detail: {
          capabilityId: route.capability.id,
          riskLevel: decision.riskLevel,
          ruleId: decision.ruleId,
        },
        outcome: decision.action === 'allow' ? 'allowed' : 'requested',
        targetId: request.id,
      })

      if (decision.action === 'deny') {
        return this.#failBeforeExecution(task, route.capability, decision.reason)
      }

      if (decision.action === 'require_approval') {
        task = this.ledger.transitionTask(
          request.id,
          ['queued'],
          'waiting_approval',
          { capabilityId: route.capability.id },
        )
        const approval = this.ledger.createApproval(request.id, decision.riskLevel, decision.reason)
        this.ledger.appendEvent(request.id, 'approval.requested', {
          approvalId: approval.id,
          reason: approval.reason,
          riskLevel: approval.riskLevel,
        })
        this.ledger.appendAudit({
          action: 'approval.request',
          actorId: request.actorId,
          detail: {
            approvalId: approval.id,
            riskLevel: approval.riskLevel,
          },
          outcome: 'requested',
          targetId: request.id,
        })
        return task
      }

      return await this.#execute(task, route.capability)
    } catch (error) {
      const latest = this.ledger.getTask(request.id)
      if (latest?.state === 'failed' || latest?.state === 'cancelled') return latest
      return this.#failBeforeExecution(task, undefined, errorMessage(error))
    }
  }

  async approve(taskId: string, actorId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId)
    if (task.state !== 'waiting_approval') {
      throw new Error(`Task ${taskId} is not waiting for approval`)
    }
    const approval = this.ledger.resolveApproval(taskId, 'approved', actorId)
    this.ledger.appendEvent(taskId, 'approval.resolved', {
      approvalId: approval.id,
      decidedBy: actorId,
      status: 'approved',
    })
    this.ledger.appendAudit({
      action: 'approval.approve',
      actorId,
      detail: { approvalId: approval.id },
      outcome: 'allowed',
      targetId: taskId,
    })
    const queued = this.ledger.transitionTask(taskId, ['waiting_approval'], 'queued')
    return this.#execute(queued, this.#requireAssignedCapability(queued))
  }

  reject(taskId: string, actorId: string): TaskRecord {
    const task = this.requireTask(taskId)
    if (task.state !== 'waiting_approval') {
      throw new Error(`Task ${taskId} is not waiting for approval`)
    }
    const approval = this.ledger.resolveApproval(taskId, 'rejected', actorId)
    this.ledger.appendEvent(taskId, 'approval.resolved', {
      approvalId: approval.id,
      decidedBy: actorId,
      status: 'rejected',
    })
    this.ledger.appendAudit({
      action: 'approval.reject',
      actorId,
      detail: { approvalId: approval.id },
      outcome: 'denied',
      targetId: taskId,
    })
    return this.ledger.transitionTask(taskId, ['waiting_approval'], 'cancelled', {
      error: 'Approval rejected',
    })
  }

  cancel(taskId: string, actorId: string): TaskRecord {
    const task = this.requireTask(taskId)
    if (isTerminal(task.state)) return task

    this.#controllers.get(taskId)?.abort()
    if (task.state === 'waiting_approval') {
      const approval = this.ledger.getApprovalForTask(taskId)
      if (approval?.status === 'pending') {
        this.ledger.resolveApproval(taskId, 'rejected', actorId)
      }
    }
    this.ledger.appendEvent(taskId, 'task.cancelled', { actorId })
    this.ledger.appendAudit({
      action: 'task.cancel',
      actorId,
      outcome: 'succeeded',
      targetId: taskId,
    })
    return this.ledger.transitionTask(taskId, [task.state], 'cancelled', {
      error: 'Cancelled by user',
    })
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.ledger.getTask(taskId)
  }

  requireTask(taskId: string): TaskRecord {
    const task = this.getTask(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    return task
  }

  async close(): Promise<void> {
    for (const controller of this.#controllers.values()) controller.abort()
    await this.executor.close?.()
    this.ledger.close()
  }

  async #execute(task: TaskRecord, capability: CapabilityDescriptor): Promise<TaskRecord> {
    const request = TaskRequestSchema.parse(task)
    const controller = new AbortController()
    this.#controllers.set(task.id, controller)
    this.ledger.transitionTask(task.id, ['queued'], 'running', {
      capabilityId: capability.id,
      error: null,
    })
    this.ledger.appendEvent(task.id, 'execution.started', {
      capabilityId: capability.id,
    })
    this.ledger.appendAudit({
      action: 'execution.start',
      actorId: task.actorId,
      detail: { capabilityId: capability.id },
      outcome: 'allowed',
      targetId: task.id,
    })

    try {
      const result = await this.executor.execute({
        capability,
        emit: (event) => this.#recordExecutionEvent(task.id, event),
        signal: controller.signal,
        task: request,
      })
      if (controller.signal.aborted || this.ledger.getTask(task.id)?.state === 'cancelled') {
        return this.requireTask(task.id)
      }
      this.ledger.appendEvent(task.id, 'execution.completed', {
        capabilityId: capability.id,
        sessionId: result.sessionId ?? null,
      })
      const completed = this.ledger.transitionTask(task.id, ['running'], 'completed', {
        dshSessionId: result.sessionId ?? null,
        result: result.output,
      })
      this.ledger.appendAudit({
        action: 'execution.complete',
        actorId: task.actorId,
        detail: {
          capabilityId: capability.id,
          sessionId: result.sessionId ?? null,
        },
        outcome: 'succeeded',
        targetId: task.id,
      })
      return completed
    } catch (error) {
      const current = this.requireTask(task.id)
      if (current.state === 'cancelled') return current
      const message = errorMessage(error)
      this.ledger.appendEvent(task.id, 'execution.failed', {
        capabilityId: capability.id,
        error: message,
      })
      const failed = this.ledger.transitionTask(task.id, ['running'], 'failed', { error: message })
      this.ledger.appendAudit({
        action: 'execution.complete',
        actorId: task.actorId,
        detail: { capabilityId: capability.id, error: message },
        outcome: 'failed',
        targetId: task.id,
      })
      return failed
    } finally {
      this.#controllers.delete(task.id)
    }
  }

  #recordExecutionEvent(taskId: string, event: ExecutionEvent): void {
    if (event.kind === 'progress') {
      this.ledger.appendEvent(taskId, 'execution.progress', { message: event.message })
      return
    }
    if (event.kind === 'tool.called') {
      const detail = compactObject({
        callId: event.callId,
        name: event.name,
      })
      this.ledger.appendEvent(taskId, 'tool.called', detail)
      this.ledger.appendAudit({
        action: 'tool.call',
        actorId: this.requireTask(taskId).actorId,
        detail,
        outcome: 'allowed',
        targetId: taskId,
      })
      return
    }
    const detail = compactObject({
      callId: event.callId,
      isError: event.isError,
      name: event.name,
    })
    this.ledger.appendEvent(taskId, 'tool.completed', detail)
    this.ledger.appendAudit({
      action: 'tool.complete',
      actorId: this.requireTask(taskId).actorId,
      detail,
      outcome: event.isError ? 'failed' : 'succeeded',
      targetId: taskId,
    })
  }

  #failBeforeExecution(
    task: TaskRecord,
    capability: CapabilityDescriptor | undefined,
    message: string,
  ): TaskRecord {
    this.ledger.appendEvent(task.id, 'execution.failed', compactObject({
      capabilityId: capability?.id,
      error: message,
    }))
    const failed = this.ledger.transitionTask(task.id, ['queued'], 'failed', {
      capabilityId: capability?.id ?? null,
      error: message,
    })
    this.ledger.appendAudit({
      action: 'execution.prepare',
      actorId: task.actorId,
      detail: { error: message },
      outcome: 'failed',
      targetId: task.id,
    })
    return failed
  }

  #requireAssignedCapability(task: TaskRecord): CapabilityDescriptor {
    if (!task.capabilityId) throw new Error(`Task ${task.id} has no assigned capability`)
    const decision = this.router.route(task)
    if (decision.capability.id !== task.capabilityId) {
      throw new Error(`Task ${task.id} routing changed while awaiting approval`)
    }
    return decision.capability
  }
}

function sameRequest(left: TaskRecord, right: TaskRequest): boolean {
  return left.actorId === right.actorId
    && left.channel === right.channel
    && left.content === right.content
    && left.createdAt === right.createdAt
    && JSON.stringify(left.contextRefs) === JSON.stringify(right.contextRefs)
}

function compactObject(input: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTerminal(state: TaskRecord['state']): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
}
