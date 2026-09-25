import { createHash } from 'node:crypto'
import {
  NotificationListQuerySchema,
  ReminderCreateSchema,
  ReminderListQuerySchema,
  type NormalizedReminderCreate,
  type NotificationListQuery,
  type NotificationRecord,
  type Principal,
  type ReminderCreate,
  type ReminderListQuery,
  type ReminderRecord,
} from '@lumi/contracts'
import {
  ReminderConflictError,
  ReminderNotFoundError,
  SqliteReminderStore,
  type DueProcessingResult,
  type ReminderStore,
  type SqliteReminderStoreOptions,
} from './store.ts'

export {
  ReminderConflictError,
  ReminderNotFoundError,
  SqliteReminderStore,
}
export type {
  DueProcessingResult,
  ReminderStore,
  SqliteReminderStoreOptions,
}

export type ReminderServiceErrorCode =
  | 'INVALID_REMINDER_TIME'
  | 'NOTIFICATION_NOT_FOUND'
  | 'REMINDER_CONFLICT'
  | 'REMINDER_NOT_FOUND'
  | 'REMINDER_SERVICE_CLOSED'

export class ReminderServiceError extends Error {
  constructor(
    readonly code: ReminderServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReminderServiceError'
  }
}

export interface ReminderStartupReport {
  fired: number
  notifications: number
  skipped: number
}

export interface ReminderServiceOptions {
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
  now?: () => string
  setTimer?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>
  store: ReminderStore
}

const MAX_TIMER_DELAY_MS = 2_147_483_647
const SCHEDULER_RETRY_DELAY_MS = 1_000

export class ReminderService {
  readonly #clearTimer: (handle: ReturnType<typeof setTimeout>) => void
  readonly #now: () => string
  readonly #setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>
  readonly #store: ReminderStore
  #activeScheduler = false
  #closed = false
  #principal: Principal | undefined
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: ReminderServiceOptions) {
    this.#clearTimer = options.clearTimer ?? clearTimeout
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#setTimer = options.setTimer ?? setTimeout
    this.#store = options.store
  }

  initialize(
    principal: Principal,
    mode: 'active' | 'passive' = 'active',
  ): ReminderStartupReport {
    this.#assertOpen()
    if (this.#principal) {
      if (!samePrincipal(this.#principal, principal)) {
        throw new ReminderServiceError(
          'REMINDER_CONFLICT',
          'Reminder service is already initialized for another principal',
        )
      }
      return { fired: 0, notifications: 0, skipped: 0 }
    }
    this.#principal = principal
    this.#activeScheduler = mode === 'active'
    if (!this.#activeScheduler) {
      return { fired: 0, notifications: 0, skipped: 0 }
    }
    const due = this.#store.processDue(principal, this.#now(), 'startup')
    this.#reschedule()
    return summarizeDue(due)
  }

  create(principal: Principal, input: ReminderCreate): ReminderRecord {
    this.#assertPrincipal(principal)
    if (!this.#activeScheduler) {
      throw new ReminderServiceError(
        'REMINDER_CONFLICT',
        'Another local runtime owns reminder scheduling; use its HTTP or Workbench entry point',
      )
    }
    const request = ReminderCreateSchema.parse(input)
    const now = this.#now()
    const fireAt = new Date(request.fireAt).toISOString()
    const normalized: NormalizedReminderCreate = {
      ...request,
      fireAt,
    }
    const requestDigest = reminderDigest(principal, normalized)
    const existing = this.#store.getReminderByIdempotency(
      principal,
      normalized.idempotencyKey,
    )
    if (existing) {
      if (existing.requestDigest !== requestDigest) {
        throw new ReminderServiceError(
          'REMINDER_CONFLICT',
          'The idempotency key is already bound to different reminder parameters',
        )
      }
      return existing
    }
    if (Date.parse(fireAt) <= Date.parse(now)) {
      throw new ReminderServiceError(
        'INVALID_REMINDER_TIME',
        'Reminder fireAt must be in the future',
      )
    }
    try {
      const reminder = this.#store.createReminder({
        now,
        principal,
        request: normalized,
        requestDigest,
      })
      this.#reschedule()
      return reminder
    } catch (error) {
      throw mapStoreError(error)
    }
  }

  get(principal: Principal, reminderId: string): ReminderRecord {
    this.#assertPrincipal(principal)
    const reminder = this.#store.getReminder(principal, reminderId)
    if (!reminder) {
      throw new ReminderServiceError(
        'REMINDER_NOT_FOUND',
        `Reminder not found: ${reminderId}`,
      )
    }
    return reminder
  }

  list(
    principal: Principal,
    query: Partial<ReminderListQuery> = {},
  ): ReminderRecord[] {
    this.#assertPrincipal(principal)
    const parsed = ReminderListQuerySchema.parse(query)
    return this.#store.listReminders(principal, {
      limit: parsed.limit,
      ...(parsed.status ? { status: parsed.status } : {}),
    })
  }

  cancel(principal: Principal, reminderId: string): ReminderRecord {
    this.#assertPrincipal(principal)
    try {
      const reminder = this.#store.cancelReminder(principal, reminderId, this.#now())
      this.#reschedule()
      return reminder
    } catch (error) {
      throw mapStoreError(error)
    }
  }

  getNotification(principal: Principal, notificationId: string): NotificationRecord {
    this.#assertPrincipal(principal)
    const notification = this.#store.getNotification(principal, notificationId)
    if (!notification) {
      throw new ReminderServiceError(
        'NOTIFICATION_NOT_FOUND',
        `Notification not found: ${notificationId}`,
      )
    }
    return notification
  }

  listNotifications(
    principal: Principal,
    query: Partial<NotificationListQuery> = {},
  ): NotificationRecord[] {
    this.#assertPrincipal(principal)
    const parsed = NotificationListQuerySchema.parse(query)
    return this.#store.listNotifications(principal, {
      limit: parsed.limit,
      ...(parsed.status ? { status: parsed.status } : {}),
    })
  }

  acknowledge(
    principal: Principal,
    notificationId: string,
  ): NotificationRecord {
    this.#assertPrincipal(principal)
    try {
      return this.#store.acknowledgeNotification(
        principal,
        notificationId,
        this.#now(),
      )
    } catch (error) {
      throw mapStoreError(error)
    }
  }

  wake(): ReminderStartupReport {
    this.#assertOpen()
    if (!this.#principal || !this.#activeScheduler) {
      throw new ReminderServiceError(
        'REMINDER_CONFLICT',
        'Reminder service does not own active scheduling',
      )
    }
    const due = this.#store.processDue(this.#principal, this.#now(), 'online')
    this.#reschedule()
    return summarizeDue(due)
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (this.#timer) this.#clearTimer(this.#timer)
    this.#timer = undefined
    this.#store.close()
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new ReminderServiceError(
        'REMINDER_SERVICE_CLOSED',
        'Reminder service is closed',
      )
    }
  }

  #assertPrincipal(principal: Principal): void {
    this.#assertOpen()
    if (!this.#principal || !samePrincipal(this.#principal, principal)) {
      throw new ReminderServiceError(
        'REMINDER_NOT_FOUND',
        'Reminder resources are not available for this principal',
      )
    }
  }

  #reschedule(): void {
    if (this.#timer) this.#clearTimer(this.#timer)
    this.#timer = undefined
    if (this.#closed || !this.#principal || !this.#activeScheduler) return
    const nextFireAt = this.#store.nextFireAt(this.#principal)
    if (!nextFireAt) return
    const delay = Math.max(
      1,
      Math.min(Date.parse(nextFireAt) - Date.parse(this.#now()), MAX_TIMER_DELAY_MS),
    )
    this.#armTimer(delay)
  }

  #armTimer(delayMs: number): void {
    this.#timer = this.#setTimer(() => {
      this.#timer = undefined
      try {
        this.wake()
      } catch {
        if (!this.#closed) this.#armTimer(SCHEDULER_RETRY_DELAY_MS)
      }
    }, delayMs)
    this.#timer.unref?.()
  }
}

export function createSqliteReminderService(
  options: SqliteReminderStoreOptions,
  serviceOptions: Omit<ReminderServiceOptions, 'store'> = {},
): ReminderService {
  return new ReminderService({
    ...serviceOptions,
    store: new SqliteReminderStore(options),
  })
}

function reminderDigest(
  principal: Principal,
  request: NormalizedReminderCreate,
): string {
  const canonical = JSON.stringify({
    content: request.content,
    fireAt: request.fireAt,
    misfirePolicy: request.misfirePolicy,
    ownerId: principal.ownerId,
    principalId: principal.id,
    timezone: request.timezone,
  })
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

function mapStoreError(error: unknown): Error {
  if (error instanceof ReminderConflictError) {
    return new ReminderServiceError('REMINDER_CONFLICT', error.message)
  }
  if (error instanceof ReminderNotFoundError) {
    return new ReminderServiceError(
      error.kind === 'reminder' ? 'REMINDER_NOT_FOUND' : 'NOTIFICATION_NOT_FOUND',
      error.message,
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}

function samePrincipal(left: Principal, right: Principal): boolean {
  return left.ownerId === right.ownerId && left.id === right.id
}

function summarizeDue(result: DueProcessingResult): ReminderStartupReport {
  return {
    fired: result.fired.length,
    notifications: result.notifications.length,
    skipped: result.skipped.length,
  }
}
