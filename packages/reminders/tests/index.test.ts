import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Principal } from '@lumi/contracts'
import { SqliteTaskLedger } from '@lumi/task-ledger'
import {
  ReminderService,
  ReminderServiceError,
  SqliteReminderStore,
} from '../src/index.ts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('ReminderService', () => {
  it('persists normalized reminders idempotently without changing the task schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-reminders-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    const ledger = new SqliteTaskLedger({ filename })
    ledger.close()
    let now = '2026-09-25T10:00:00.000Z'
    const { service } = harness(filename, () => now)
    service.initialize(principal())
    const input = {
      content: 'Review the release checklist',
      fireAt: '2026-09-25T18:30:00+08:00',
      idempotencyKey: 'release-checklist',
      misfirePolicy: 'latest' as const,
      timezone: 'Asia/Shanghai',
    }

    const created = service.create(principal(), input)
    now = '2026-09-25T11:00:00.000Z'
    expect(service.create(principal(), input)).toEqual(created)
    expect(() => service.create(principal(), {
      ...input,
      content: 'Changed parameters',
    })).toThrow(ReminderServiceError)
    expect(created).toMatchObject({
      fireAt: '2026-09-25T10:30:00.000Z',
      nextFireAt: '2026-09-25T10:30:00.000Z',
      status: 'scheduled',
    })
    service.close()

    const inspected = new DatabaseSync(filename)
    expect((inspected.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      .toBe(3)
    expect(inspected.prepare(
      'SELECT version, name FROM reminder_migrations ORDER BY version',
    ).all()).toEqual([{ name: 'one-time-reminders', version: 1 }])
    expect(inspected.prepare('SELECT COUNT(*) AS count FROM tasks').get())
      .toEqual({ count: 0 })
    inspected.close()
  })

  it('applies latest and skip exactly once during startup catch-up', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-reminder-misfire-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    let now = '2026-09-25T10:00:00.000Z'
    const first = harness(filename, () => now)
    first.service.initialize(principal())
    const latest = first.service.create(principal(), reminderInput(
      'latest-reminder',
      '2026-09-25T10:05:00.000Z',
      'latest',
    ))
    const skipped = first.service.create(principal(), reminderInput(
      'skip-reminder',
      '2026-09-25T10:06:00.000Z',
      'skip',
    ))
    first.service.close()

    now = '2026-09-25T10:10:00.000Z'
    const second = harness(filename, () => now)
    expect(second.service.initialize(principal())).toEqual({
      fired: 1,
      notifications: 1,
      skipped: 1,
    })
    expect(second.service.get(principal(), latest.id)).toMatchObject({
      nextFireAt: null,
      status: 'fired',
    })
    expect(second.service.get(principal(), skipped.id)).toMatchObject({
      nextFireAt: null,
      status: 'skipped',
    })
    expect(second.service.listNotifications(principal())).toHaveLength(1)
    expect(second.service.wake()).toEqual({
      fired: 0,
      notifications: 0,
      skipped: 0,
    })
    second.service.close()

    const third = harness(filename, () => now)
    expect(third.service.initialize(principal())).toEqual({
      fired: 0,
      notifications: 0,
      skipped: 0,
    })
    expect(third.service.listNotifications(principal())).toHaveLength(1)
    third.service.close()
  })

  it('replaces a later timer and fires each reminder once', () => {
    let now = '2026-09-25T10:00:00.000Z'
    const scheduler = fakeScheduler()
    const store = new SqliteReminderStore({ filename: ':memory:' })
    const service = new ReminderService({
      clearTimer: scheduler.clear,
      now: () => now,
      setTimer: scheduler.set,
      store,
    })
    service.initialize(principal())
    service.create(principal(), reminderInput(
      'later',
      '2026-09-25T10:00:10.000Z',
      'latest',
    ))
    expect(scheduler.current()?.delay).toBe(10_000)

    service.create(principal(), reminderInput(
      'earlier',
      '2026-09-25T10:00:05.000Z',
      'latest',
    ))
    expect(scheduler.clear).toHaveBeenCalledOnce()
    expect(scheduler.current()?.delay).toBe(5_000)

    now = '2026-09-25T10:00:05.000Z'
    scheduler.fire()
    expect(service.listNotifications(principal())).toHaveLength(1)
    expect(scheduler.current()?.delay).toBe(5_000)

    now = '2026-09-25T10:00:10.000Z'
    scheduler.fire()
    expect(service.listNotifications(principal())).toHaveLength(2)
    expect(scheduler.current()).toBeUndefined()
    expect(service.wake().notifications).toBe(0)
    service.close()
  })

  it('cancels a scheduled reminder before it can notify', () => {
    let now = '2026-09-25T10:00:00.000Z'
    const { service } = harness(':memory:', () => now)
    service.initialize(principal())
    const reminder = service.create(principal(), reminderInput(
      'cancel-once',
      '2026-09-25T10:05:00.000Z',
      'latest',
    ))

    expect(service.cancel(principal(), reminder.id).status).toBe('cancelled')
    expect(service.cancel(principal(), reminder.id).status).toBe('cancelled')
    now = '2026-09-25T10:10:00.000Z'
    expect(service.wake().notifications).toBe(0)
    expect(service.listNotifications(principal())).toEqual([])
    service.close()
  })

  it('acknowledges a notification idempotently and isolates another owner', () => {
    let now = '2026-09-25T10:00:00.000Z'
    const { service } = harness(':memory:', () => now)
    service.initialize(principal())
    service.create(principal(), reminderInput(
      'ack-once',
      '2026-09-25T10:05:00.000Z',
      'latest',
    ))
    now = '2026-09-25T10:05:00.000Z'
    service.wake()
    const notification = service.listNotifications(principal())[0]
    expect(notification?.status).toBe('unread')

    now = '2026-09-25T10:06:00.000Z'
    const acknowledged = service.acknowledge(principal(), notification?.id ?? '')
    now = '2026-09-25T10:07:00.000Z'
    expect(service.acknowledge(principal(), notification?.id ?? ''))
      .toEqual(acknowledged)
    expect(() => service.getNotification(otherPrincipal(), notification?.id ?? ''))
      .toThrow('not available for this principal')
    service.close()
  })
})

function harness(filename: string, now: () => string) {
  const scheduler = fakeScheduler()
  const service = new ReminderService({
    clearTimer: scheduler.clear,
    now,
    setTimer: scheduler.set,
    store: new SqliteReminderStore({ filename }),
  })
  return { scheduler, service }
}

function reminderInput(
  idempotencyKey: string,
  fireAt: string,
  misfirePolicy: 'latest' | 'skip',
) {
  return {
    content: `Reminder ${idempotencyKey}`,
    fireAt,
    idempotencyKey,
    misfirePolicy,
    timezone: 'UTC',
  }
}

function principal(): Principal {
  return {
    authStrength: 'local_process',
    id: 'local-user',
    kind: 'owner',
    ownerId: 'local-owner',
  }
}

function otherPrincipal(): Principal {
  return {
    authStrength: 'local_process',
    id: 'other-user',
    kind: 'owner',
    ownerId: 'other-owner',
  }
}

function fakeScheduler() {
  let scheduled:
    | {
        callback: () => void
        delay: number
        handle: ReturnType<typeof setTimeout>
      }
    | undefined
  const set = vi.fn((callback: () => void, delay: number) => {
    const handle = {
      unref: () => handle,
    } as unknown as ReturnType<typeof setTimeout>
    scheduled = { callback, delay, handle }
    return handle
  })
  const clear = vi.fn((handle: ReturnType<typeof setTimeout>) => {
    if (scheduled?.handle === handle) scheduled = undefined
  })
  return {
    clear,
    current: () => scheduled,
    fire: () => {
      const current = scheduled
      scheduled = undefined
      current?.callback()
    },
    set,
  }
}
