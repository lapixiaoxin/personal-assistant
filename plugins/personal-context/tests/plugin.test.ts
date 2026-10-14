import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply,
  computePersonalContextRevision,
  loadPersonalContextSnapshot,
  resolveConfig,
  type LumiPersonalContextRuntime,
  type PersonalContextSnapshot,
} from '../src/plugin.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('personal context DSH plugin', () => {
  it('reloads a valid snapshot for each assembly and keeps status content-free', async () => {
    const path = temporarySnapshot('First private preference')
    let contextProvider: (() => string) | undefined
    let tool: {
      execute(args: Record<string, never>, execution: { signal: AbortSignal }): Promise<string>
    } | undefined
    const disposers: Array<() => void> = []
    const context: LumiPersonalContextRuntime = {
      effect(register) {
        const disposer = register()
        if (disposer) disposers.push(disposer)
      },
      systemPrompt: {
        context(input) {
          contextProvider = input.text
          return vi.fn()
        },
      },
      tools: {
        register(definition) {
          tool = definition as typeof tool
          return vi.fn()
        },
      },
    }

    apply(context, {
      ownerId: 'owner-one',
      purpose: 'general_assistance',
      snapshotPath: path,
    })

    expect(contextProvider?.()).toContain('First private preference')
    writeSnapshot(path, snapshot('Second private preference'))
    expect(contextProvider?.()).toContain('Second private preference')

    const status = await tool?.execute({}, {
      signal: new AbortController().signal,
    })
    expect(status).toContain('"entryCount":1')
    expect(status).not.toContain('Second private preference')
    expect(disposers).toHaveLength(2)
  })

  it('fails closed for missing, mismatched and tampered snapshots', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-dsh-plugin-'))
    temporaryDirectories.push(directory)
    const missing = join(directory, 'missing.json')
    const config = {
      ownerId: 'owner-one',
      purpose: 'general_assistance' as const,
      snapshotPath: missing,
    }

    expect(() => loadPersonalContextSnapshot(config)).toThrow()

    const path = join(directory, 'context.json')
    writeSnapshot(path, snapshot('Private preference'))
    expect(() => loadPersonalContextSnapshot({
      ...config,
      ownerId: 'owner-two',
      snapshotPath: path,
    })).toThrow('owner mismatch')

    const tampered = snapshot('Private preference')
    writeSnapshot(path, {
      ...tampered,
      entries: [{ ...tampered.entries[0], content: 'Changed without digest' }],
    })
    expect(() => loadPersonalContextSnapshot({
      ...config,
      snapshotPath: path,
    })).toThrow('revision does not match')
  })

  it('rejects incomplete or unexpected config', () => {
    expect(() => resolveConfig({
      ownerId: 'owner-one',
      purpose: 'general_assistance',
    })).toThrow('missing field')
    expect(() => resolveConfig({
      extra: true,
      ownerId: 'owner-one',
      purpose: 'general_assistance',
      snapshotPath: '/tmp/context.json',
    })).toThrow('unknown field')
  })
})

function temporarySnapshot(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'lumi-dsh-plugin-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'context.json')
  writeSnapshot(path, snapshot(content))
  return path
}

function snapshot(content: string): PersonalContextSnapshot {
  const base = {
    entries: [{
      content,
      id: 'memory-one',
      kind: 'preference' as const,
      revision: 1,
      scope: 'global' as const,
      source: 'test_fixture',
    }],
    generatedAt: '2026-09-28T08:00:00.000Z',
    ownerId: 'owner-one',
    purpose: 'general_assistance' as const,
    schemaVersion: 'lumi.personal-context/v1' as const,
  }
  return {
    ...base,
    revision: computePersonalContextRevision(base),
  }
}

function writeSnapshot(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}
