import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('personal memory CLI', () => {
  it('persists confirm, correct, and forget operations across independent processes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-memory-cli-'))
    temporaryDirectories.push(directory)
    const database = join(directory, 'assistant.db')
    const created = runCli(database, [
      'memory',
      'add',
      'Prefer concise meeting notes',
      '--candidate',
      '--purpose',
      'meeting',
      '--scope',
      'meeting',
    ]) as { id: string; revision: number; status: string }
    expect(created).toMatchObject({ revision: 1, status: 'candidate' })

    expect(runCli(database, ['memory', 'list', '--status', 'candidate']))
      .toEqual([expect.objectContaining({ id: created.id, status: 'candidate' })])
    expect(runCli(database, ['memory', 'confirm', created.id]))
      .toMatchObject({ id: created.id, revision: 2, status: 'confirmed' })
    expect(runCli(database, [
      'memory',
      'correct',
      created.id,
      'Prefer decision-first meeting notes',
      '--purpose',
      'meeting',
      '--scope',
      'meeting',
    ])).toMatchObject({
      content: 'Prefer decision-first meeting notes',
      id: created.id,
      revision: 3,
      status: 'confirmed',
    })
    const tombstone = runCli(database, ['memory', 'forget', created.id])
    expect(tombstone).toMatchObject({ id: created.id, lastRevision: 3 })
    expect(JSON.stringify(tombstone)).not.toContain('decision-first')
    expect(runCli(database, ['memory', 'list'])).toEqual([])
  }, 15_000)
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
