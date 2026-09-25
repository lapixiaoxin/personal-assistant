import { describe, expect, it, vi } from 'vitest'
import { createTaskRequest, type CapabilityDescriptor } from '@lumi/contracts'
import { DshAdapter, DshExecutionError, TaskExecutionAbortedError } from '../src/index.ts'

const capability: CapabilityDescriptor = {
  description: 'Coding specialist',
  id: 'coding-agent',
  kind: 'agent',
  operations: ['edit_code'],
  riskLevel: 'write',
}

describe('DshAdapter', () => {
  it('fails closed when a protected capability has no action broker', async () => {
    const adapter = new DshAdapter({
      actionBridgeCapabilities: ['personal-assistant'],
      cwd: process.cwd(),
    })

    await expect(adapter.execute({
      capability: {
        description: 'General personal assistance',
        id: 'personal-assistant',
        kind: 'agent',
        operations: ['answer'],
        riskLevel: 'read',
      },
      emit: () => undefined,
      signal: new AbortController().signal,
      task: createTaskRequest({
        actorId: 'user-1',
        channel: 'test',
        content: 'Answer safely',
        id: 'task-missing-action-broker',
      }),
    })).rejects.toThrow('requires a configured lumi action broker')
  })

  it('maps the SDK result and redacted tool lifecycle into core events', async () => {
    const close = vi.fn(async () => undefined)
    const adapter = new DshAdapter({ cwd: process.cwd() }, async () => ({
      close,
      run: async (_prompt, options) => {
        options.onNotification?.({
          method: 'session.event',
          params: {
            event: {
              type: 'tool/call',
              data: {
                arguments: '{"secret":"must-not-be-audited"}',
                callId: 'call-1',
                name: 'write',
              },
            },
          },
        })
        options.onNotification?.({
          method: 'session.event',
          params: {
            event: {
              type: 'tool/result',
              data: {
                message: {
                  content: [{
                    content: [{ type: 'text', text: 'written' }],
                    isError: false,
                    toolCallId: 'call-1',
                    type: 'tool-result',
                  }],
                  source: { callId: 'call-1' },
                },
              },
            },
          },
        })
        return { finalResponse: 'Done', sessionId: options.sessionId ?? 'missing' }
      },
    }))
    const events: unknown[] = []

    const result = await adapter.execute({
      capability,
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
      task: createTaskRequest({
        actorId: 'user-1',
        channel: 'test',
        content: 'Implement it',
        id: 'task-adapter',
      }),
    })

    expect(result).toEqual({ output: 'Done', sessionId: 'pa-task-adapter' })
    expect(events).toEqual([
      { kind: 'tool.called', callId: 'call-1', name: 'write' },
      { kind: 'tool.completed', callId: 'call-1', isError: false },
    ])
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(close).toHaveBeenCalledOnce()
  })

  it('maps a DSH tool-result error marker into a failed tool event', async () => {
    const adapter = new DshAdapter({ cwd: process.cwd() }, async () => ({
      close: async () => undefined,
      run: async (_prompt, options) => {
        options.onNotification?.({
          method: 'session.event',
          params: {
            event: {
              type: 'tool/result',
              data: {
                message: {
                  content: [{ type: 'text', text: 'denied' }],
                  isError: true,
                  source: { callId: 'call-denied' },
                  toolCallId: 'call-denied',
                },
              },
            },
          },
        })
        return { finalResponse: 'Handled', sessionId: 'session-denied' }
      },
    }))
    const events: unknown[] = []

    await adapter.execute({
      capability,
      emit: event => events.push(event),
      signal: new AbortController().signal,
      task: createTaskRequest({
        actorId: 'user-1',
        channel: 'test',
        content: 'Try a denied tool',
        id: 'task-denied-adapter',
      }),
    })

    expect(events).toEqual([
      { kind: 'tool.completed', callId: 'call-denied', isError: true },
    ])
  })

  it('closes the owned DSH process when execution is cancelled', async () => {
    const close = vi.fn(async () => undefined)
    const adapter = new DshAdapter({ cwd: process.cwd() }, async () => ({
      close,
      run: () => new Promise(() => undefined),
    }))
    const controller = new AbortController()
    const execution = adapter.execute({
      capability,
      emit: () => undefined,
      signal: controller.signal,
      task: createTaskRequest({
        actorId: 'user-1',
        channel: 'test',
        content: 'Implement it',
        id: 'task-cancel-adapter',
      }),
    })

    controller.abort()
    await expect(execution).rejects.toThrow(TaskExecutionAbortedError)
    expect(close).toHaveBeenCalled()
  })

  it('does not report a failed DSH turn as a successful empty response', async () => {
    const adapter = new DshAdapter({ cwd: process.cwd() }, async () => ({
      close: async () => undefined,
      run: async () => ({
        events: [{
          type: 'turn/end',
          data: {
            reason: {
              kind: 'error',
              error: { message: 'provider rejected the request' },
            },
          },
        }],
        finalResponse: '',
        sessionId: 'failed-session',
      }),
    }))

    await expect(adapter.execute({
      capability,
      emit: () => undefined,
      signal: new AbortController().signal,
      task: createTaskRequest({
        actorId: 'user-1',
        channel: 'test',
        content: 'Implement it',
        id: 'task-failed-adapter',
      }),
    })).rejects.toThrow(new DshExecutionError(
      'DSH turn ended with error: provider rejected the request',
    ))
  })
})
