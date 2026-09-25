import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionRecord, Principal } from '@lumi/contracts'
import { DefaultActionPolicyEngine } from '@lumi/policy'
import {
  ActionAuthorizationError,
  ActionConflictError,
  SqliteTaskLedger,
} from '@lumi/task-ledger'
import { ActionService, digest, type ArtifactProvider } from '../src/index.ts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}
const temporaryDirectories: string[] = []
const principal: Principal = {
  authStrength: 'local_process',
  id: 'local-user',
  kind: 'owner',
  ownerId: 'local-owner',
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('ActionService', () => {
  it('binds stable idempotency to one authorized, verified artifact', async () => {
    const fixture = createFixture()
    const first = fixture.service.prepare(principal, proposal('once', 'hello'))
    const replay = fixture.service.prepare(principal, proposal('once', 'hello'))

    expect(replay.action.id).toBe(first.action.id)
    expect(() => fixture.service.prepare(principal, proposal('once', 'changed')))
      .toThrow(ActionConflictError)

    const firstAuthorization = fixture.service.authorize(principal, first.action.id)
    const replayedAuthorization = fixture.service.authorize(principal, first.action.id)
    expect(replayedAuthorization.authorization?.id).toBe(firstAuthorization.authorization?.id)
    const completed = await fixture.service.execute(principal, first.action.id)

    expect(completed).toMatchObject({
      action: { status: 'succeeded' },
      authorization: { remainingUses: 0, status: 'consumed' },
      receipt: { recovered: false, status: 'succeeded' },
      task: { state: 'completed' },
      verification: { status: 'passed' },
    })
    expect(fixture.writeCount()).toBe(1)
    expect(JSON.stringify(fixture.ledger.listAudit(first.action.id))).not.toContain('hello')
    fixture.ledger.close()
  })

  it('rejects content tampering after authorization without creating a file', async () => {
    const fixture = createFixture()
    const prepared = fixture.service.prepare(principal, proposal('tamper', 'approved'))
    fixture.service.authorize(principal, prepared.action.id)
    const tamper = new DatabaseSync(fixture.dbPath)
    tamper.prepare('UPDATE action_inputs SET content = ? WHERE action_id = ?')
      .run('not approved', prepared.action.id)
    tamper.close()

    await expect(fixture.service.execute(principal, prepared.action.id))
      .rejects.toThrow(ActionAuthorizationError)
    expect(fixture.writeCount()).toBe(0)
    fixture.ledger.close()
  })

  it('rejects target and capability version tampering after authorization', async () => {
    for (const mutation of [
      { column: 'target', value: JSON.stringify({ artifactId: 'changed-target' }) },
      {
        column: 'capability',
        value: JSON.stringify({ id: 'local-artifact', version: '9.9.9' }),
      },
    ]) {
      const fixture = createFixture()
      const prepared = fixture.service.prepare(
        principal,
        proposal(`tamper-${mutation.column}`, 'approved'),
      )
      fixture.service.authorize(principal, prepared.action.id)
      const tamper = new DatabaseSync(fixture.dbPath)
      tamper.prepare(`UPDATE actions SET ${mutation.column} = ? WHERE id = ?`)
        .run(mutation.value, prepared.action.id)
      tamper.close()

      await expect(fixture.service.execute(principal, prepared.action.id)).rejects.toBeDefined()
      expect(fixture.writeCount()).toBe(0)
      fixture.ledger.close()
    }
  })

  it('rejects an expired authorization without creating a file', async () => {
    const root = temporaryRoot()
    let current = '2026-09-25T10:00:00.000Z'
    const now = () => current
    const ledger = new SqliteTaskLedger({ filename: join(root, 'assistant.db'), now })
    const provider = new InMemoryArtifactProvider()
    const service = new ActionService({
      authorizationTtlMs: 1_000,
      ledger,
      now,
      policy: new DefaultActionPolicyEngine(),
      provider,
    })
    const prepared = service.prepare(principal, proposal('expired', 'content'))
    service.authorize(principal, prepared.action.id)
    current = '2026-09-25T10:00:02.000Z'

    await expect(service.execute(principal, prepared.action.id)).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
    })
    expect(provider.size).toBe(0)
    ledger.close()
  })

  it('allows only one concurrent execution to consume the authorization', async () => {
    const root = temporaryRoot()
    const local = new InMemoryArtifactProvider()
    let releaseWrite: (() => void) | undefined
    let reportStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => {
      reportStarted = resolve
    })
    const gate = new Promise<void>(resolve => {
      releaseWrite = resolve
    })
    const provider: ArtifactProvider = {
      read: action => local.read(action),
      write: async (action, content) => {
        reportStarted?.()
        await gate
        return local.write(action, content)
      },
    }
    const fixture = createFixture({ provider, root })
    const prepared = fixture.service.prepare(principal, proposal('concurrent', 'one write'))
    fixture.service.authorize(principal, prepared.action.id)

    const first = fixture.service.execute(principal, prepared.action.id)
    await started
    await expect(fixture.service.execute(principal, prepared.action.id)).rejects.toMatchObject({
      code: 'OUTCOME_UNKNOWN',
      safeToRetry: false,
    })
    expect(fixture.service.cancel(principal, prepared.action.id)).toMatchObject({
      effectMayRemain: true,
      preventedExecution: false,
    })
    releaseWrite?.()
    await expect(first).resolves.toMatchObject({
      action: {
        cancellationRequestedAt: '2026-09-25T10:00:00.000Z',
        status: 'succeeded',
      },
      task: { state: 'completed' },
    })
    expect(fixture.writeCount()).toBe(1)
    fixture.ledger.close()
  })

  it('reconciles a file written before the receipt commit after reopening the ledger', async () => {
    const root = temporaryRoot()
    const dbPath = join(root, 'assistant.db')
    const provider = new InMemoryArtifactProvider()
    const firstLedger = new SqliteTaskLedger({ filename: dbPath, now: fixedNow })
    const firstService = new ActionService({
      afterProviderWrite: () => {
        throw new Error('injected crash before receipt commit')
      },
      ledger: firstLedger,
      now: fixedNow,
      policy: new DefaultActionPolicyEngine(),
      provider,
    })
    const prepared = firstService.prepare(principal, proposal('recover', 'survives restart'))
    firstService.authorize(principal, prepared.action.id)
    await expect(firstService.execute(principal, prepared.action.id)).rejects.toMatchObject({
      code: 'OUTCOME_UNKNOWN',
      safeToRetry: false,
    })
    expect(firstLedger.getAction(prepared.action.id)?.status).toBe('outcome_unknown')
    firstLedger.close()

    const secondLedger = new SqliteTaskLedger({ filename: dbPath, now: fixedNow })
    const secondService = new ActionService({
      ledger: secondLedger,
      now: fixedNow,
      policy: new DefaultActionPolicyEngine(),
      provider,
    })
    const recovered = await secondService.reconcile(principal, prepared.action.id)

    expect(recovered).toMatchObject({
      action: { status: 'succeeded' },
      receipt: { recovered: true },
      task: { state: 'completed' },
      verification: { status: 'passed' },
    })
    expect(provider.size).toBe(1)
    secondLedger.close()
  })

  it('fails verification when a provider reports success without a readable artifact', async () => {
    const provider: ArtifactProvider = {
      read: async () => ({
        artifactRef: 'file:///missing',
        contentDigest: null,
        exists: false,
      }),
      write: async (action: ActionRecord) => ({
        artifactRef: 'file:///missing',
        contentDigest: action.inputDigest,
        providerVersion: 'fake-provider/1',
      }),
    }
    const fixture = createFixture({ provider })
    const prepared = fixture.service.prepare(principal, proposal('fake-success', 'content'))
    fixture.service.authorize(principal, prepared.action.id)

    const result = await fixture.service.execute(principal, prepared.action.id)

    expect(result).toMatchObject({
      action: { status: 'failed' },
      task: { state: 'failed' },
      verification: { status: 'failed' },
    })
    fixture.ledger.close()
  })

  it('maps bounded provider errors without depending on an adapter error class', async () => {
    const provider: ArtifactProvider = {
      read: async action => ({
        artifactRef: `memory://${action.id}`,
        contentDigest: null,
        exists: false,
      }),
      write: async () => {
        throw Object.assign(new Error('provider conflict'), { code: 'CONFLICT' })
      },
    }
    const fixture = createFixture({ provider })
    const prepared = fixture.service.prepare(principal, proposal('provider-error', 'content'))
    fixture.service.authorize(principal, prepared.action.id)

    await expect(fixture.service.execute(principal, prepared.action.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'provider conflict',
      retryable: false,
      safeToRetry: false,
    })
    fixture.ledger.close()
  })

  it('distinguishes prevention from cancellation after an effect', async () => {
    const fixture = createFixture()
    const before = fixture.service.prepare(principal, proposal('cancel-before', 'content'))
    fixture.service.authorize(principal, before.action.id)
    expect(fixture.service.cancel(principal, before.action.id)).toMatchObject({
      action: { status: 'cancelled' },
      effectMayRemain: false,
      preventedExecution: true,
    })
    await expect(fixture.service.execute(principal, before.action.id)).rejects.toBeDefined()

    const after = fixture.service.prepare(principal, proposal('cancel-after', 'content'))
    fixture.service.authorize(principal, after.action.id)
    await fixture.service.execute(principal, after.action.id)
    expect(fixture.service.cancel(principal, after.action.id)).toMatchObject({
      action: { status: 'succeeded' },
      effectMayRemain: true,
      preventedExecution: false,
    })
    fixture.ledger.close()
  })
})

function createFixture(options: {
  provider?: ArtifactProvider
  root?: string
} = {}) {
  const root = options.root ?? temporaryRoot()
  const dbPath = join(root, 'assistant.db')
  const ledger = new SqliteTaskLedger({ filename: dbPath, now: fixedNow })
  const delegate = options.provider ?? new InMemoryArtifactProvider()
  let writes = 0
  const provider: ArtifactProvider = {
    read: action => delegate.read(action),
    write: (action, content) => {
      writes += 1
      return delegate.write(action, content)
    },
  }
  const service = new ActionService({
    ledger,
    now: fixedNow,
    policy: new DefaultActionPolicyEngine(),
    provider,
  })
  return { dbPath, ledger, service, writeCount: () => writes }
}

function proposal(idempotencyKey: string, content: string) {
  return {
    content,
    idempotencyKey,
    operation: 'artifact.write' as const,
    schemaVersion: 'lumi.action-proposal/v1' as const,
    target: { artifactId: idempotencyKey },
  }
}

function temporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lumi-action-'))
  temporaryDirectories.push(directory)
  return directory
}

function fixedNow(): string {
  return '2026-09-25T10:00:00.000Z'
}

class InMemoryArtifactProvider implements ArtifactProvider {
  readonly #artifacts = new Map<string, string>()

  get size(): number {
    return this.#artifacts.size
  }

  async read(action: ActionRecord) {
    const contentDigest = this.#artifacts.get(action.id) ?? null
    return {
      artifactRef: `memory://${action.id}`,
      contentDigest,
      exists: contentDigest !== null,
    }
  }

  async write(action: ActionRecord, content: string) {
    const contentDigest = digest(content)
    this.#artifacts.set(action.id, contentDigest)
    return {
      artifactRef: `memory://${action.id}`,
      contentDigest,
      providerVersion: 'in-memory-artifact/1',
    }
  }
}
