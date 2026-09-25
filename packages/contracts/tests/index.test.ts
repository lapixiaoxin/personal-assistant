import { describe, expect, it } from 'vitest'
import {
  ActionProposalSubmissionSchema,
  createTaskRequest,
  TaskRequestSchema,
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
