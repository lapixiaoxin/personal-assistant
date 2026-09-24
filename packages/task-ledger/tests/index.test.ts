import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTaskRequest } from '@lumi/contracts'
import { SqliteTaskLedger, TaskStateConflictError } from '../src/index.ts'

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
})
