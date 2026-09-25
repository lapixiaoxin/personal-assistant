import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistantRuntime } from '../../apps/runtime/src/index.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('persistent reminders', () => {
  it('fires through a real local timer without creating an assistant task', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-reminder-timer-'))
    temporaryDirectories.push(directory)
    const database = join(directory, 'assistant.db')
    const execute = vi.fn(async () => ({ output: 'must not run' }))
    const runtime = createAssistantRuntime({
      dbPath: database,
      executor: { execute },
    })
    await runtime.ready
    runtime.reminders.create(runtime.identity.localPrincipal(), {
      content: 'Real timer reminder',
      fireAt: new Date(Date.now() + 250).toISOString(),
      idempotencyKey: 'real-timer-reminder',
      misfirePolicy: 'latest',
      timezone: 'UTC',
    })

    await waitFor(() =>
      runtime.reminders.listNotifications(runtime.identity.localPrincipal()).length === 1,
    )

    expect(runtime.reminders.list(runtime.identity.localPrincipal())).toEqual([
      expect.objectContaining({ status: 'fired' }),
    ])
    expect(runtime.ledger.listTasks({ limit: 200 })).toEqual([])
    expect(execute).not.toHaveBeenCalled()
    await runtime.close()
  })

  it('applies latest and skip across independent CLI processes without duplicates', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-reminder-cli-'))
    temporaryDirectories.push(directory)
    const database = join(directory, 'assistant.db')
    const fireAt = new Date(Date.now() + 6_000).toISOString()

    expect(runCli(database, [
      'reminder',
      'add',
      'Catch up this reminder',
      '--at',
      fireAt,
      '--key',
      'cli-latest',
      '--timezone',
      'UTC',
    ])).toMatchObject({ status: 'scheduled' })
    expect(runCli(database, [
      'reminder',
      'add',
      'Skip this reminder',
      '--at',
      fireAt,
      '--key',
      'cli-skip',
      '--timezone',
      'UTC',
      '--misfire',
      'skip',
    ])).toMatchObject({ status: 'scheduled' })

    await delay(Math.max(0, Date.parse(fireAt) - Date.now()) + 150)

    const unread = runCli(database, [
      'notification',
      'list',
      '--status',
      'unread',
    ]) as Array<{ content: string; id: string; status: string }>
    expect(unread).toEqual([
      expect.objectContaining({
        content: 'Catch up this reminder',
        status: 'unread',
      }),
    ])
    expect(runCli(database, ['reminder', 'list', '--status', 'skipped']))
      .toEqual([
        expect.objectContaining({
          content: 'Skip this reminder',
          status: 'skipped',
        }),
      ])
    expect(runCli(database, ['notification', 'list'])).toHaveLength(1)

    expect(runCli(database, [
      'notification',
      'acknowledge',
      unread[0]?.id ?? '',
    ])).toMatchObject({ status: 'acknowledged' })
    expect(runCli(database, ['notification', 'list'])).toHaveLength(1)
    expect(runCli(database, ['list'])).toEqual([])
  }, 20_000)
})

function runCli(database: string, args: string[]): unknown {
  const output = execFileSync(
    process.execPath,
    [
      resolve('node_modules/tsx/dist/cli.mjs'),
      'apps/local-runner/src/main.ts',
      '--db',
      database,
      ...args,
    ],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        PA_EXECUTOR: 'mock',
      },
    },
  )
  return JSON.parse(output)
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Reminder did not fire before timeout')
    await delay(25)
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}
