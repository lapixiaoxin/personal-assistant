import { describe, expect, it } from 'vitest'
import { createTaskRequest, TaskRequestSchema } from '../src/index.ts'

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
