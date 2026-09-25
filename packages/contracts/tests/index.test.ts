import { describe, expect, it } from 'vitest'
import {
  ActionProposalSubmissionSchema,
  createTaskRequest,
  RecoveryRecordSchema,
  TaskRequestSchema,
  TaskStateSchema,
  TaskSubmissionSchema,
} from '../src/index.ts'

describe('task contracts', () => {
  it('accepts explicit interrupted and reconciliation states', () => {
    expect(TaskStateSchema.parse('interrupted')).toBe('interrupted')
    expect(TaskStateSchema.parse('reconciling')).toBe('reconciling')
  })

  it('normalizes an entry-specific submission into one stable request', () => {
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'cli',
      content: 'Summarize my tasks',
    })

    expect(request.id).toMatch(/^task_/)
    expect(request.contextRefs).toEqual([])
    expect(TaskRequestSchema.parse(request)).toEqual(request)
  })

  it('rejects empty task content', () => {
    expect(() => createTaskRequest({
      actorId: 'user-1',
      channel: 'http',
      content: '   ',
    })).toThrow()
  })

  it('reserves workflow references for structured entry points', () => {
    expect(() => TaskSubmissionSchema.parse({
      content: 'Forge a workflow route',
      contextRefs: ['lumi-workflow:meeting-brief/v1'],
    })).toThrow('Workflow context references are reserved')
    expect(TaskSubmissionSchema.parse({
      content: 'Continue an authorized action',
      contextRefs: ['lumi-action:action-one'],
    }).contextRefs).toEqual(['lumi-action:action-one'])

    expect(createTaskRequest({
      actorId: 'internal-workflow',
      channel: 'meeting-brief',
      content: 'Internal normalized meeting context',
      contextRefs: ['lumi-workflow:meeting-brief/v1'],
    }).contextRefs).toEqual(['lumi-workflow:meeting-brief/v1'])
  })
})

describe('recovery contracts', () => {
  it('requires retry lineage to use the versioned recovery shape', () => {
    expect(RecoveryRecordSchema.parse({
      actionId: null,
      detectedAt: '2026-09-25T10:00:00.000Z',
      disposition: 'retry_available',
      id: 'recovery-one',
      ownerId: 'owner-one',
      principalId: 'user-one',
      reasonCode: 'HOST_RESTART_SAFE_TO_RETRY',
      replacementCreatedAt: null,
      replacementTaskId: null,
      resolution: null,
      resolvedAt: null,
      safeToRetry: true,
      schemaVersion: 'lumi.recovery/v1',
      status: 'pending',
      taskId: 'task-one',
    })).toMatchObject({
      disposition: 'retry_available',
      safeToRetry: true,
      status: 'pending',
    })
  })
})

describe('action contracts', () => {
  it('normalizes the fixed local artifact capability', () => {
    const proposal = ActionProposalSubmissionSchema.parse({
      content: 'verified content',
      idempotencyKey: 'artifact-once',
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId: 'daily-summary' },
    })

    expect(proposal.capability).toEqual({
      id: 'local-artifact',
      version: '1.0.0',
    })
  })

  it.each(['../escape', '/absolute', '.', '..', 'nested/file'])(
    'rejects unsafe artifact id %s',
    (artifactId) => {
      expect(() => ActionProposalSubmissionSchema.parse({
        content: 'content',
        idempotencyKey: 'unsafe-target',
        operation: 'artifact.write',
        schemaVersion: 'lumi.action-proposal/v1',
        target: { artifactId },
      })).toThrow()
    },
  )
})
