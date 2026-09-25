import { resolve } from 'node:path'
import type {
  ExecutionEvent,
  ExecutionInput,
  ExecutionResult,
  TaskExecutor,
} from '@lumi/assistant-core'
import {
  createDshChildEnvironment,
  startDshActionBridge,
  type DshActionBroker,
} from './action-bridge.ts'

export {
  actionIdsFromContextRefs,
  createDshChildEnvironment,
  startDshActionBridge,
  type DshActionBridgeOptions,
  type DshActionBridgeRun,
  type DshActionBroker,
  type DshBrokerInvocation,
} from './action-bridge.ts'

interface HarnessNotification {
  method: string
  params: Record<string, unknown>
}

interface HarnessRunResult {
  events?: readonly unknown[]
  finalResponse: string
  sessionId: string
}

interface HarnessPort {
  close(): Promise<void>
  run(
    input: string,
    options: {
      onNotification?: (notification: HarnessNotification) => void
      sessionId?: string
    },
  ): Promise<HarnessRunResult>
}

type HarnessFactory = (input: ExecutionInput) => Promise<HarnessPort>

export interface DshAdapterOptions {
  actionBridgeCapabilities?: readonly string[]
  actionBridgeReadyTimeoutMs?: number
  actionBroker?: DshActionBroker
  capabilityPatchFiles?: Readonly<Record<string, readonly string[]>>
  cwd: string
  dshHome?: string
  maxTokens?: number
  model?: string
  patchFiles?: readonly string[]
  patchFile?: string
  profile?: string
  provider?: string
}

export class TaskExecutionAbortedError extends Error {
  constructor() {
    super('Task execution was cancelled')
    this.name = 'TaskExecutionAbortedError'
  }
}

export class DshExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshExecutionError'
  }
}

export class DshAdapter implements TaskExecutor {
  readonly #createHarness: HarnessFactory

  constructor(options: DshAdapterOptions, factory?: HarnessFactory) {
    this.#createHarness = factory ?? createDshHarnessFactory(options)
  }

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    if (input.signal.aborted) throw new TaskExecutionAbortedError()

    const harness = await this.#createHarness(input)
    if (input.signal.aborted) {
      await harness.close()
      throw new TaskExecutionAbortedError()
    }
    let rejectAbort: ((reason: Error) => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    const onAbort = (): void => {
      rejectAbort?.(new TaskExecutionAbortedError())
      void harness.close()
    }
    input.signal.addEventListener('abort', onAbort, { once: true })

    try {
      const run = harness.run(buildPrompt(input), {
        onNotification: (notification) => {
          const event = mapNotification(notification)
          if (event) input.emit(event)
        },
        sessionId: `pa-${input.task.id}`,
      })
      const result = await Promise.race([run, aborted])
      const failure = terminalFailure(result.events)
      if (failure) throw new DshExecutionError(failure)
      if (result.finalResponse.trim() === '') {
        throw new DshExecutionError('DSH completed without a final assistant response')
      }
      return {
        output: result.finalResponse,
        sessionId: result.sessionId,
      }
    } catch (error) {
      if (input.signal.aborted) throw new TaskExecutionAbortedError()
      throw error
    } finally {
      input.signal.removeEventListener('abort', onAbort)
      await harness.close()
    }
  }
}

function terminalFailure(events: readonly unknown[] | undefined): string | undefined {
  if (!events) return undefined
  for (let index = events.length - 1; index >= 0; index--) {
    const event = asRecord(events[index])
    if (event?.type !== 'turn/end') continue
    const data = asRecord(event.data)
    const reason = asRecord(data?.reason)
    if (!reason || reason.kind === 'completed') return undefined
    const failure = asRecord(reason.error)
    const detail = typeof failure?.message === 'string' ? `: ${failure.message}` : ''
    return `DSH turn ended with ${String(reason.kind)}${detail}`
  }
  return undefined
}

export interface MockDshAdapterOptions {
  delayMs?: number
  response?: (input: ExecutionInput) => string
}

export class MockDshAdapter implements TaskExecutor {
  constructor(private readonly options: MockDshAdapterOptions = {}) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    input.emit({
      kind: 'progress',
      message: `Delegated to ${input.capability.id}`,
    })
    await abortableDelay(this.options.delayMs ?? 0, input.signal)
    if (input.signal.aborted) throw new TaskExecutionAbortedError()

    return {
      output: this.options.response?.(input)
        ?? `[mock:${input.capability.id}] ${input.task.content}`,
      sessionId: `mock-${input.task.id}`,
    }
  }
}

function createDshHarnessFactory(options: DshAdapterOptions): HarnessFactory {
  const defaultPatchFile = resolve(
    options.cwd,
    options.patchFile ?? 'profiles/dsh-lumi/cordis.patch.yml',
  )
  const actionBridgeCapabilities = new Set(options.actionBridgeCapabilities ?? [])
  return async (input) => {
    const bridge = actionBridgeCapabilities.has(input.capability.id)
      ? await createActionBridge(options, input)
      : undefined
    const { DeepSeekHarness } = await import('@deepseek-ai/dsh-sdk-client')
    const commonPatches = (options.patchFiles ?? []).map((patch) => resolve(options.cwd, patch))
    const configuredPatches = options.capabilityPatchFiles?.[input.capability.id]
    const capabilityPatches = configuredPatches
      ? configuredPatches.map((patch) => resolve(options.cwd, patch))
      : [defaultPatchFile]
    try {
      const harness = new DeepSeekHarness({
        cwd: resolve(options.cwd),
        ...(options.dshHome ? { dshHome: options.dshHome } : {}),
        env: createDshChildEnvironment(process.env, bridge?.environment),
        maxTokens: options.maxTokens ?? 8_192,
        model: options.model ?? 'deepseek-v4-flash',
        patches: [...commonPatches, ...capabilityPatches],
        processCwd: resolve(options.cwd),
        profile: options.profile ?? 'sdk',
        provider: options.provider ?? 'deepseek-official',
      })
      try {
        await harness.start()
        await bridge?.waitUntilReady(options.actionBridgeReadyTimeoutMs)
      } catch (error) {
        await harness.close().catch(() => undefined)
        throw error
      }
      if (!bridge) return harness
      return {
        close: async () => {
          try {
            await harness.close()
          } finally {
            await bridge.close()
          }
        },
        run: (prompt, runOptions) => harness.run(prompt, runOptions),
      }
    } catch (error) {
      await bridge?.close()
      throw error
    }
  }
}

async function createActionBridge(
  options: DshAdapterOptions,
  input: ExecutionInput,
) {
  if (!options.actionBroker) {
    throw new DshExecutionError(
      `DSH capability ${input.capability.id} requires a configured lumi action broker`,
    )
  }
  return startDshActionBridge({
    broker: options.actionBroker,
    contextRefs: input.task.contextRefs,
    taskId: input.task.id,
  })
}

function buildPrompt(input: ExecutionInput): string {
  const context = input.task.contextRefs.length > 0
    ? input.task.contextRefs.map((reference) => `- ${reference}`).join('\n')
    : '- none'

  return [
    'Execute the following task as the selected specialist.',
    `Task ID: ${input.task.id}`,
    `Capability: ${input.capability.id}`,
    `Allowed operations: ${input.capability.operations.join(', ')}`,
    '',
    'Goal:',
    input.task.content,
    '',
    'Context references:',
    context,
    '',
    'Return a concise final result for the personal assistant to relay.',
  ].join('\n')
}

function mapNotification(notification: HarnessNotification): ExecutionEvent | undefined {
  if (notification.method === 'subagent.started') {
    return { kind: 'progress', message: 'DSH started a specialist subagent.' }
  }
  if (notification.method === 'subagent.finished') {
    return { kind: 'progress', message: 'DSH specialist subagent finished.' }
  }
  if (notification.method !== 'session.event') return undefined

  const event = asRecord(notification.params.event)
  const data = asRecord(event?.data)
  if (event?.type === 'tool/call' && typeof data?.name === 'string') {
    const callId = typeof data.callId === 'string' ? data.callId : undefined
    return {
      kind: 'tool.called',
      ...(callId ? { callId } : {}),
      name: data.name,
    }
  }
  if (event?.type === 'tool/result') {
    const callId = toolResultCallId(data)
    return {
      kind: 'tool.completed',
      ...(callId ? { callId } : {}),
      isError: toolResultIsError(data),
    }
  }
  return undefined
}

function toolResultCallId(data: Record<string, unknown> | undefined): string | undefined {
  const message = asRecord(data?.message)
  const source = asRecord(message?.source)
  return typeof source?.callId === 'string' ? source.callId : undefined
}

function toolResultIsError(data: Record<string, unknown> | undefined): boolean {
  if (data?.error !== undefined) return true
  const message = asRecord(data?.message)
  if (message?.isError === true) return true
  if (!Array.isArray(message?.content)) return false
  return message.content.some((block) => {
    const record = asRecord(block)
    return record?.type === 'tool-result' && record.isError === true
  })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolveDelay, reject) => {
    const timer = setTimeout(resolveDelay, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new TaskExecutionAbortedError())
    }, { once: true })
  })
}
