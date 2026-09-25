import { createHash } from 'node:crypto'
import {
  ActionDetailSchema,
  ActionProposalSubmissionSchema,
  ActionRecordSchema,
  createId,
  createTaskRequest,
  type ActionCancellationResult,
  type ActionDetail,
  type ActionErrorCode,
  type ActionProposal,
  type ActionProposalSubmission,
  type ActionRecord,
  type JsonValue,
  type Principal,
} from '@lumi/contracts'
import {
  artifactProviderErrorCode,
  type ArtifactProvider,
  type ArtifactWriteResult,
} from './provider.ts'
import type { ActionPolicyEngine } from '@lumi/policy'
import type { ActionLedger, TaskLedger } from '@lumi/task-ledger'

export type {
  ArtifactObservation,
  ArtifactProvider,
  ArtifactProviderErrorCode,
  ArtifactWriteResult,
} from './provider.ts'

export class ActionServiceError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly safeToRetry: boolean,
  ) {
    super(message)
    this.name = 'ActionServiceError'
  }
}

export interface ActionServiceOptions {
  afterProviderWrite?: (
    action: ActionRecord,
    result: ArtifactWriteResult,
  ) => Promise<void> | void
  authorizationTtlMs?: number
  ledger: ActionLedger & TaskLedger
  now?: () => string
  policy: ActionPolicyEngine
  provider: ArtifactProvider
}

export class ActionService {
  readonly #authorizationTtlMs: number
  readonly #ledger: ActionLedger & TaskLedger
  readonly #now: () => string

  constructor(private readonly options: ActionServiceOptions) {
    this.#ledger = options.ledger
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#authorizationTtlMs = options.authorizationTtlMs ?? 10 * 60 * 1000
  }

  prepare(principal: Principal, input: ActionProposalSubmission): ActionDetail {
    const proposal = ActionProposalSubmissionSchema.parse(input)
    const now = this.#now()
    const decision = this.options.policy.evaluateAction(principal, proposal, now)
    if (decision.action === 'deny') {
      throw new ActionServiceError('PERMISSION_DENIED', decision.reason, false, false)
    }
    const actionId = createId('action')
    const inputDigest = digest(proposal.content)
    const actionDigest = digestCanonical({
      capability: proposal.capability,
      deadline: proposal.deadline ?? null,
      effect: 'local_artifact',
      idempotencyKey: proposal.idempotencyKey,
      inputDigest,
      operation: proposal.operation,
      ownerId: principal.ownerId,
      principalId: principal.id,
      target: proposal.target,
    })
    const task = createTaskRequest({
      actorId: principal.id,
      channel: 'action-runtime',
      content: `${proposal.operation} ${proposal.target.artifactId}`,
      createdAt: now,
      id: createId('task'),
    })
    const action = ActionRecordSchema.parse({
      actionDigest,
      authorizationId: null,
      cancellationRequestedAt: null,
      capability: proposal.capability,
      createdAt: now,
      deadline: proposal.deadline ?? null,
      effect: 'local_artifact',
      id: actionId,
      idempotencyKey: proposal.idempotencyKey,
      inputDigest,
      inputRef: `action-input:${actionId}`,
      operation: proposal.operation,
      ownerId: principal.ownerId,
      principalId: principal.id,
      receiptId: null,
      revocationEpoch: 0,
      schemaVersion: 'lumi.action/v1',
      status: 'prepared',
      target: proposal.target,
      taskId: task.id,
      updatedAt: now,
      verificationId: null,
    })
    const prepared = this.#ledger.prepareAction({
      action,
      content: proposal.content,
      task,
    })
    this.#ledger.appendAudit({
      action: 'action.prepare',
      actorId: principal.id,
      detail: {
        actionDigest: prepared.actionDigest,
        capabilityVersion: prepared.capability.version,
        effect: prepared.effect,
        operation: prepared.operation,
        target: prepared.target,
      },
      outcome: 'requested',
      targetId: prepared.id,
      targetType: 'action',
    })
    return this.get(principal, prepared.id)
  }

  authorize(principal: Principal, actionId: string): ActionDetail {
    const action = this.#requireOwnedAction(principal, actionId)
    const proposal = this.#proposalForAction(action)
    const now = this.#now()
    const decision = this.options.policy.evaluateAction(principal, proposal, now)
    if (decision.action === 'deny') {
      throw new ActionServiceError('PERMISSION_DENIED', decision.reason, false, false)
    }
    const candidateExpiry = new Date(Date.parse(now) + this.#authorizationTtlMs).toISOString()
    const expiresAt = action.deadline && Date.parse(action.deadline) < Date.parse(candidateExpiry)
      ? action.deadline
      : candidateExpiry
    const authorization = this.#ledger.authorizeAction(
      action.id,
      principal,
      expiresAt,
      decision.policyVersion,
    )
    this.#ledger.appendAudit({
      action: 'action.authorize',
      actorId: principal.id,
      detail: {
        actionDigest: authorization.actionDigest,
        authorizationId: authorization.id,
        capabilityVersion: authorization.capabilityVersion,
        expiresAt: authorization.expiresAt,
        maxUses: authorization.maxUses,
        policyVersion: authorization.policyVersion,
      },
      outcome: 'allowed',
      targetId: action.id,
      targetType: 'action',
    })
    return this.get(principal, action.id)
  }

  async execute(principal: Principal, actionId: string): Promise<ActionDetail> {
    const before = this.#requireOwnedAction(principal, actionId)
    if (before.status === 'succeeded') return this.#verify(principal, before)
    if (before.status === 'executing' || before.status === 'outcome_unknown') {
      throw new ActionServiceError(
        'OUTCOME_UNKNOWN',
        'The action may already have executed; reconcile it before retrying',
        true,
        false,
      )
    }

    const action = this.#ledger.claimActionExecution(actionId, principal)
    let writeResult: ArtifactWriteResult | undefined
    try {
      writeResult = await this.options.provider.write(
        action,
        this.#ledger.getActionContent(action.id),
      )
      await this.options.afterProviderWrite?.(action, writeResult)
      this.#ledger.recordActionSucceeded({
        actionId: action.id,
        artifactRef: writeResult.artifactRef,
        contentDigest: writeResult.contentDigest,
        providerVersion: writeResult.providerVersion,
      })
    } catch (error) {
      if (writeResult) {
        this.#ledger.markActionOutcomeUnknown(action.id)
        this.#ledger.appendAudit({
          action: 'action.execute',
          actorId: principal.id,
          detail: {
            code: 'OUTCOME_UNKNOWN',
            safeToRetry: false,
          },
          outcome: 'failed',
          targetId: action.id,
          targetType: 'action',
        })
        throw new ActionServiceError(
          'OUTCOME_UNKNOWN',
          'The artifact may exist but its receipt was not committed; reconcile before retrying',
          true,
          false,
        )
      }
      const message = errorMessage(error)
      this.#ledger.recordVerification({
        actionId: action.id,
        evidenceRefs: [],
        expectedDigest: action.inputDigest,
        observedDigest: null,
        reason: `Provider rejected the action: ${message}`,
        status: 'failed',
        verifierVersion: 'local-artifact-verifier/1',
      })
      this.#ledger.appendAudit({
        action: 'action.execute',
        actorId: principal.id,
        detail: { error: message, safeToRetry: false },
        outcome: 'failed',
        targetId: action.id,
        targetType: 'action',
      })
      const providerCode = artifactProviderErrorCode(error)
      if (providerCode) {
        throw new ActionServiceError(providerCode, errorMessage(error), false, false)
      }
      throw error
    }
    return this.#verify(principal, this.#requireOwnedAction(principal, action.id))
  }

  async reconcile(principal: Principal, actionId: string): Promise<ActionDetail> {
    const action = this.#requireOwnedAction(principal, actionId)
    if (action.status === 'succeeded') return this.#verify(principal, action)
    if (action.status !== 'executing' && action.status !== 'outcome_unknown') {
      throw new ActionServiceError(
        'CONFLICT',
        `Action ${action.id} is ${action.status}; only uncertain actions can be reconciled`,
        false,
        false,
      )
    }
    const observation = await this.options.provider.read(action)
    if (observation.exists && observation.contentDigest === action.inputDigest) {
      this.#ledger.recordActionSucceeded({
        actionId: action.id,
        artifactRef: observation.artifactRef,
        contentDigest: observation.contentDigest,
        providerVersion: 'local-artifact/1',
        recovered: true,
      })
      this.#ledger.appendEvent(action.taskId, 'action.reconciled', {
        actionId: action.id,
        artifactRef: observation.artifactRef,
        recovered: true,
      })
      this.#ledger.appendAudit({
        action: 'action.reconcile',
        actorId: principal.id,
        detail: { recovered: true },
        outcome: 'succeeded',
        targetId: action.id,
        targetType: 'action',
      })
      return this.#verify(principal, this.#requireOwnedAction(principal, action.id))
    }
    const verification = this.#ledger.recordVerification({
      actionId: action.id,
      evidenceRefs: observation.exists ? [observation.artifactRef] : [],
      expectedDigest: action.inputDigest,
      observedDigest: observation.contentDigest,
      reason: observation.exists
        ? 'Reconciliation found an artifact with the wrong digest'
        : 'Reconciliation found no artifact',
      status: 'failed',
      verifierVersion: 'local-artifact-verifier/1',
    })
    this.#ledger.appendAudit({
      action: 'action.reconcile',
      actorId: principal.id,
      detail: {
        safeToRetry: false,
        verificationId: verification.id,
      },
      outcome: 'failed',
      targetId: action.id,
      targetType: 'action',
    })
    return this.get(principal, action.id)
  }

  cancel(principal: Principal, actionId: string): ActionCancellationResult {
    const before = this.#requireOwnedAction(principal, actionId)
    const action = this.#ledger.cancelAction(actionId, principal)
    const preventedExecution = before.status === 'prepared' || before.status === 'authorized'
    const result = {
      action,
      effectMayRemain: !preventedExecution,
      preventedExecution,
    }
    this.#ledger.appendAudit({
      action: 'action.cancel',
      actorId: principal.id,
      detail: {
        effectMayRemain: result.effectMayRemain,
        preventedExecution,
        statusAtCancellation: before.status,
      },
      outcome: 'succeeded',
      targetId: action.id,
      targetType: 'action',
    })
    return result
  }

  get(principal: Principal, actionId: string): ActionDetail {
    const action = this.#requireOwnedAction(principal, actionId)
    const task = this.#ledger.getTask(action.taskId)
    if (!task) throw new Error(`Task not found: ${action.taskId}`)
    return ActionDetailSchema.parse({
      action,
      authorization: this.#ledger.getAuthorizationForAction(action.id) ?? null,
      receipt: this.#ledger.getReceiptForAction(action.id) ?? null,
      task,
      verification: this.#ledger.getVerificationForAction(action.id) ?? null,
    })
  }

  list(principal: Principal, limit = 50): ActionDetail[] {
    return this.#ledger.listActions(principal.ownerId, limit)
      .filter(action => action.principalId === principal.id)
      .map(action => this.get(principal, action.id))
  }

  async #verify(principal: Principal, action: ActionRecord): Promise<ActionDetail> {
    const existing = this.#ledger.getVerificationForAction(action.id)
    if (existing) return this.get(principal, action.id)
    const receipt = this.#ledger.getReceiptForAction(action.id)
    const observation = await this.options.provider.read(action)
    const passed = Boolean(
      receipt
      && observation.exists
      && observation.contentDigest === action.inputDigest
      && receipt.contentDigest === action.inputDigest
      && receipt.artifactRef === observation.artifactRef,
    )
    const verification = this.#ledger.recordVerification({
      actionId: action.id,
      evidenceRefs: observation.exists ? [observation.artifactRef] : [],
      expectedDigest: action.inputDigest,
      observedDigest: observation.contentDigest,
      reason: passed
        ? 'Artifact exists and its digest matches the authorized action'
        : 'Artifact read-back did not match the authorized action and receipt',
      status: passed ? 'passed' : 'failed',
      verifierVersion: 'local-artifact-verifier/1',
    })
    this.#ledger.appendAudit({
      action: 'action.verify',
      actorId: principal.id,
      detail: {
        status: verification.status,
        verificationId: verification.id,
      },
      outcome: passed ? 'succeeded' : 'failed',
      targetId: action.id,
      targetType: 'action',
    })
    return this.get(principal, action.id)
  }

  #proposalForAction(action: ActionRecord): ActionProposal {
    return ActionProposalSubmissionSchema.parse({
      capability: action.capability,
      content: this.#ledger.getActionContent(action.id),
      ...(action.deadline ? { deadline: action.deadline } : {}),
      idempotencyKey: action.idempotencyKey,
      operation: action.operation,
      schemaVersion: 'lumi.action-proposal/v1',
      target: action.target,
    })
  }

  #requireOwnedAction(principal: Principal, actionId: string): ActionRecord {
    const action = this.#ledger.getAction(actionId)
    if (!action) {
      throw new ActionServiceError('INVALID_INPUT', `Action not found: ${actionId}`, false, false)
    }
    if (action.ownerId !== principal.ownerId || action.principalId !== principal.id) {
      throw new ActionServiceError(
        'PERMISSION_DENIED',
        'The action belongs to another principal',
        false,
        false,
      )
    }
    return action
  }
}

export function digest(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function digestCanonical(value: JsonValue): string {
  return digest(JSON.stringify(sortJson(value)))
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
