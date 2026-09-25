import type { ActionStatus, TaskState } from '@lumi/contracts'

export class DuplicateTaskError extends Error {
  constructor(readonly taskId: string) {
    super(`Task already exists: ${taskId}`)
    this.name = 'DuplicateTaskError'
  }
}

export class TaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`Task not found: ${taskId}`)
    this.name = 'TaskNotFoundError'
  }
}

export class TaskStateConflictError extends Error {
  constructor(readonly taskId: string, readonly actual: TaskState, readonly expected: readonly TaskState[]) {
    super(`Task ${taskId} is ${actual}; expected ${expected.join(' or ')}`)
    this.name = 'TaskStateConflictError'
  }
}

export class ActionConflictError extends Error {
  constructor(readonly actionId: string, message: string) {
    super(message)
    this.name = 'ActionConflictError'
  }
}

export class ActionNotFoundError extends Error {
  constructor(readonly actionId: string) {
    super(`Action not found: ${actionId}`)
    this.name = 'ActionNotFoundError'
  }
}

export class ActionStateConflictError extends Error {
  constructor(
    readonly actionId: string,
    readonly actual: ActionStatus,
    readonly expected: readonly ActionStatus[],
  ) {
    super(`Action ${actionId} is ${actual}; expected ${expected.join(' or ')}`)
    this.name = 'ActionStateConflictError'
  }
}

export class ActionAuthorizationError extends Error {
  constructor(
    readonly code: 'APPROVAL_EXPIRED' | 'APPROVAL_REQUIRED' | 'CANCELLED' | 'PERMISSION_DENIED',
    message: string,
  ) {
    super(message)
    this.name = 'ActionAuthorizationError'
  }
}

export class RecoveryNotFoundError extends Error {
  constructor(readonly recoveryId: string) {
    super(`Recovery not found: ${recoveryId}`)
    this.name = 'RecoveryNotFoundError'
  }
}

export class RecoveryStateConflictError extends Error {
  constructor(readonly recoveryId: string, message: string) {
    super(message)
    this.name = 'RecoveryStateConflictError'
  }
}
