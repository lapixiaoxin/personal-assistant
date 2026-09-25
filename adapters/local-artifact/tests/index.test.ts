import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionRecord } from '@lumi/contracts'
import {
  ArtifactBoundaryError,
  LocalArtifactProvider,
} from '../src/index.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('LocalArtifactProvider', () => {
  it('atomically creates and independently reads one deterministic artifact', async () => {
    const root = temporaryRoot()
    const provider = new LocalArtifactProvider(root)
    const action = actionRecord('action-write', 'hello')

    const written = await provider.write(action, 'hello')
    const observed = await provider.read(action)

    expect(written.contentDigest).toBe(action.inputDigest)
    expect(observed).toEqual({
      artifactRef: written.artifactRef,
      contentDigest: action.inputDigest,
      exists: true,
    })
    expect(readFileSync(new URL(written.artifactRef), 'utf8')).toBe('hello')
    await expect(provider.write(action, 'hello')).rejects.toThrow(ArtifactBoundaryError)
  })

  it('does not follow an existing target symlink', async () => {
    const root = temporaryRoot()
    const outside = join(temporaryRoot(), 'outside.txt')
    writeFileSync(outside, 'unchanged')
    const action = actionRecord('action-symlink', 'new content')
    const actionKey = createHash('sha256').update(action.id).digest('hex').slice(0, 16)
    symlinkSync(outside, join(root, `summary.${actionKey}.artifact`))
    const provider = new LocalArtifactProvider(root)

    await expect(provider.write(action, 'new content')).rejects.toThrow(ArtifactBoundaryError)
    expect(readFileSync(outside, 'utf8')).toBe('unchanged')
  })

  it('rejects an artifact root that is itself a symlink', async () => {
    const parent = temporaryRoot()
    const actual = temporaryRoot()
    const linked = join(parent, 'linked-root')
    symlinkSync(actual, linked)
    const provider = new LocalArtifactProvider(linked)

    await expect(provider.read(actionRecord('action-root-link', 'content')))
      .rejects.toThrow(ArtifactBoundaryError)
  })
})

function temporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lumi-artifact-'))
  temporaryDirectories.push(directory)
  return directory
}

function actionRecord(id: string, content: string): ActionRecord {
  const inputDigest = `sha256:${createHash('sha256').update(content).digest('hex')}`
  return {
    actionDigest: `sha256:${'a'.repeat(64)}`,
    authorizationId: null,
    cancellationRequestedAt: null,
    capability: { id: 'local-artifact', version: '1.0.0' },
    createdAt: '2026-09-25T10:00:00.000Z',
    deadline: null,
    effect: 'local_artifact',
    id,
    idempotencyKey: `key-${id}`,
    inputDigest,
    inputRef: `action-input:${id}`,
    operation: 'artifact.write',
    ownerId: 'owner-1',
    principalId: 'principal-1',
    receiptId: null,
    revocationEpoch: 0,
    schemaVersion: 'lumi.action/v1',
    status: 'executing',
    target: { artifactId: 'summary' },
    taskId: `task-${id}`,
    updatedAt: '2026-09-25T10:00:00.000Z',
    verificationId: null,
  }
}
