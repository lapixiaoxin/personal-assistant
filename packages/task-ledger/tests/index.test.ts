import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTaskRequest,
  type ActionRecord,
  type JsonValue,
  type Principal,
} from '@lumi/contracts'
import {
  ActionStateConflictError,
  SqliteTaskLedger,
  TaskStateConflictError,
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

describe('SqliteTaskLedger', () => {
  it('persists tasks, events, approvals, and audit records across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-ledger-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'test',
      content: 'Send the report',
      createdAt: '2026-09-24T10:00:00.000Z',
      id: 'task-persisted',
    })

    const first = new SqliteTaskLedger({ filename })
    first.createTask(request)
    first.transitionTask(request.id, ['queued'], 'waiting_approval', {
      capabilityId: 'personal-assistant',
    })
    const approval = first.createApproval(request.id, 'external', 'Approval required')
    first.appendEvent(request.id, 'approval.requested', { approvalId: approval.id })
    first.appendAudit({
      action: 'approval.request',
      actorId: request.actorId,
      outcome: 'requested',
      targetId: request.id,
    })
    first.close()

    const reopened = new SqliteTaskLedger({ filename })
    expect(reopened.getTask(request.id)).toMatchObject({
      capabilityId: 'personal-assistant',
      state: 'waiting_approval',
    })
    expect(reopened.listEvents(request.id).map((event) => event.sequence)).toEqual([0, 1, 2])
    expect(reopened.getApprovalForTask(request.id)).toMatchObject({
      riskLevel: 'external',
      status: 'pending',
    })
    expect(reopened.listAudit(request.id)).toHaveLength(1)
    reopened.close()
  })

  it('rejects invalid state transitions', () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'test',
      content: 'Read this',
      id: 'task-state',
    })
    ledger.createTask(request)

    expect(() => ledger.transitionTask(request.id, ['running'], 'completed'))
      .toThrow(TaskStateConflictError)
    ledger.close()
  })

  it('migrates a version 1 database without losing historical tasks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-ledger-v1-'))
    temporaryDirectories.push(directory)
    const filename = join(directory, 'assistant.db')
    const legacy = new DatabaseSync(filename)
    legacy.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, channel TEXT NOT NULL,
        content TEXT NOT NULL, context_refs TEXT NOT NULL, state TEXT NOT NULL,
        capability_id TEXT, result TEXT, error TEXT, dsh_session_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE task_events (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
        sequence INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL, UNIQUE(task_id, sequence)
      );
      CREATE TABLE audit_records (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
        target_type TEXT NOT NULL, target_id TEXT NOT NULL, outcome TEXT NOT NULL,
        detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
        risk_level TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
        requested_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT
      );
      INSERT INTO tasks VALUES (
        'legacy-task', 'local-user', 'cli', 'legacy content', '[]', 'completed',
        NULL, 'legacy result', NULL, NULL,
        '2026-09-24T10:00:00.000Z', '2026-09-24T10:00:01.000Z'
      );
      PRAGMA user_version = 1;
    `)
    legacy.close()
    const backupFilename = join(directory, 'assistant.v1.backup.db')
    copyFileSync(filename, backupFilename)

    const ledger = new SqliteTaskLedger({ filename })
    expect(ledger.getTask('legacy-task')).toMatchObject({
      result: 'legacy result',
      state: 'completed',
    })
    ledger.close()

    const inspected = new DatabaseSync(filename)
    expect((inspected.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      .toBe(2)
    expect(inspected.prepare('SELECT version FROM migration_history ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }])
    inspected.close()

    const rollback = new DatabaseSync(backupFilename)
    expect((rollback.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      .toBe(1)
    expect(rollback.prepare('SELECT id, result FROM tasks').get()).toEqual({
      id: 'legacy-task',
      result: 'legacy result',
    })
    rollback.close()
  })

  it('atomically consumes a one-use action authorization', () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:', now: fixedNow })
    const principal = testPrincipal()
    const action = prepareAction(ledger, principal)
    ledger.authorizeAction(
      action.id,
      principal,
      '2026-09-25T10:10:00.000Z',
      'local-action-policy/1',
    )

    expect(ledger.claimActionExecution(action.id, principal).status).toBe('executing')
    expect(() => ledger.claimActionExecution(action.id, principal))
      .toThrow(ActionStateConflictError)
    expect(ledger.getAuthorizationForAction(action.id)).toMatchObject({
      remainingUses: 0,
      status: 'consumed',
    })
    ledger.close()
  })
})

function fixedNow(): string {
  return '2026-09-25T10:00:00.000Z'
}

function testPrincipal(): Principal {
  return {
    authStrength: 'local_process',
    id: 'local-user',
    kind: 'owner',
    ownerId: 'local-owner',
  }
}

function prepareAction(ledger: SqliteTaskLedger, principal: Principal): ActionRecord {
  const content = 'verified content'
  const inputDigest = digest(content)
  const action = {
    actionDigest: digest(JSON.stringify(sortJson({
      capability: { id: 'local-artifact', version: '1.0.0' },
      deadline: null,
      effect: 'local_artifact',
      idempotencyKey: 'ledger-action',
      inputDigest,
      operation: 'artifact.write',
      ownerId: principal.ownerId,
      principalId: principal.id,
      target: { artifactId: 'summary' },
    }))),
    authorizationId: null,
    cancellationRequestedAt: null,
    capability: { id: 'local-artifact' as const, version: '1.0.0' as const },
    createdAt: fixedNow(),
    deadline: null,
    effect: 'local_artifact' as const,
    id: 'action-ledger',
    idempotencyKey: 'ledger-action',
    inputDigest,
    inputRef: 'action-input:action-ledger',
    operation: 'artifact.write' as const,
    ownerId: principal.ownerId,
    principalId: principal.id,
    receiptId: null,
    revocationEpoch: 0,
    schemaVersion: 'lumi.action/v1' as const,
    status: 'prepared' as const,
    target: { artifactId: 'summary' },
    taskId: 'task-action-ledger',
    updatedAt: fixedNow(),
    verificationId: null,
  }
  ledger.prepareAction({
    action,
    content,
    task: createTaskRequest({
      actorId: principal.id,
      channel: 'test',
      content: 'artifact.write summary',
      createdAt: fixedNow(),
      id: action.taskId,
    }),
  })
  return action
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
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
