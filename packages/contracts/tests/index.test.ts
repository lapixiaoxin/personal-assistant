import { describe, expect, it } from 'vitest'
import {
  ActionProposalSubmissionSchema,
  createTaskRequest,
  TaskRequestSchema,
  TaskSubmissionSchema,
} from '../src/index.ts'

describe('task contracts', () => {
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
