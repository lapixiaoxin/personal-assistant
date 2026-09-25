import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTaskRequest } from '../../packages/contracts/src/index.ts'
import { SqliteTaskLedger } from '../../packages/task-ledger/src/index.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('task recovery CLI', () => {
  it('detects a stale runtime after the executing process is killed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-recovery-crash-'))
    temporaryDirectories.push(directory)
    const database = join(directory, 'assistant.db')

    await crashBlockingRuntime(database)

    const pending = runCli(database, [
      'recovery',
      'list',
      '--status',
      'pending',
    ]) as Array<{
      disposition: string
      safeToRetry: boolean
      taskId: string
    }>
    expect(pending).toEqual([
      expect.objectContaining({
        disposition: 'retry_available',
        safeToRetry: true,
        taskId: 'task-forced-crash',
      }),
    ])
  })

  it('discovers interrupted tasks and preserves explicit retry decisions across processes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-recovery-cli-'))
    temporaryDirectories.push(directory)
    const database = join(directory, 'assistant.db')
    const ledger = new SqliteTaskLedger({ filename: database })
    seedRunningTask(
      ledger,
      'task-cli-safe',
      'personal-assistant',
      'Summarize the interrupted work',
    )
    seedRunningTask(
      ledger,
      'task-cli-manual',
      'coding-agent',
      'Implement an interrupted code change',
    )
    ledger.close()

    const pending = runCli(database, [
      'recovery',
      'list',
      '--status',
      'pending',
    ]) as Array<{
      disposition: string
      id: string
      taskId: string
    }>
    expect(pending).toHaveLength(2)
    const safe = pending.find(item => item.taskId === 'task-cli-safe')
    const manual = pending.find(item => item.taskId === 'task-cli-manual')
    expect(safe?.disposition).toBe('retry_available')
    expect(manual?.disposition).toBe('manual_review')

    const retried = runCli(database, [
      'recovery',
      'retry',
      safe?.id ?? '',
    ]) as {
      recovery: { replacementTaskId: string; resolution: string }
      task: { result: string; state: string }
    }
    expect(retried).toMatchObject({
      recovery: { resolution: 'retried' },
      task: { state: 'completed' },
    })
    expect(retried.task.result).toContain('[mock:personal-assistant]')

    const denied = runCliFailure(database, [
      'recovery',
      'retry',
      manual?.id ?? '',
    ])
    expect(denied.status).toBe(1)
    expect(denied.stderr).toContain('cannot be retried automatically')

    expect(runCli(database, [
      'recovery',
      'acknowledge',
      manual?.id ?? '',
    ])).toMatchObject({
      resolution: 'acknowledged',
      status: 'resolved',
    })
    expect(runCli(database, ['recovery', 'list', '--status', 'pending'])).toEqual([])
  })
})

function crashBlockingRuntime(database: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx/esm',
        'tests/fixtures/blocking-runtime.ts',
        database,
      ],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          PA_EXECUTOR: 'mock',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let running = false
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Blocking runtime did not start: ${stderr}`))
    }, 10_000)
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.stdout.on('data', chunk => {
      if (running || !String(chunk).includes('RUNNING')) return
      running = true
      child.kill('SIGKILL')
    })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (_code, signal) => {
      clearTimeout(timer)
      if (running && signal === 'SIGKILL') resolvePromise()
      else reject(new Error(`Blocking runtime exited before forced crash: ${stderr}`))
    })
  })
}

function seedRunningTask(
  ledger: SqliteTaskLedger,
  taskId: string,
  capabilityId: string,
  content: string,
): void {
  ledger.createTask(createTaskRequest({
    actorId: 'local-user',
    channel: 'cli',
    content,
    createdAt: '2026-09-25T10:00:00.000Z',
    id: taskId,
  }))
  ledger.transitionTask(taskId, ['queued'], 'running', { capabilityId })
  ledger.appendEvent(taskId, 'execution.started', { capabilityId })
}

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

function runCliFailure(
  database: string,
  args: string[],
): { status: number | null; stderr: string } {
  const result = spawnSync(
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
  return {
    status: result.status,
    stderr: result.stderr,
  }
}
