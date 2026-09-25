import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startMockLlmServer, type MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { DshAdapter } from '../../adapters/dsh/src/index.ts'
import { buildGateway } from '../../apps/gateway/src/server.ts'
import { createAssistantRuntime, type AssistantRuntime } from '../../apps/runtime/src/index.ts'
import { createTaskRequest } from '../../packages/contracts/src/index.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const testDataRoot = join(projectRoot, 'data')
const runtimes: AssistantRuntime[] = []
const servers: MockLlmServer[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()))
  await Promise.all(servers.splice(0).map((server) => server.close()))
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
  vi.unstubAllEnvs()
})

describe('DSH runtime contract', () => {
  it('runs a routed coding task through the real DSH SDK process', async () => {
    const modelServer = await startMockLlmServer({
      apiKey: 'contract-key',
      sequence: ['success'],
      successText: 'DSH main flow completed',
    })
    servers.push(modelServer)
    vi.stubEnv('DEEPSEEK_API_KEY', 'contract-key')
    vi.stubEnv('DEEPSEEK_BASE_URL', `${modelServer.baseURL}/v1`)

    const directory = temporaryDirectory('dsh-contract-')
    directories.push(directory)
    const executor = new DshAdapter({
      capabilityPatchFiles: {
        'coding-agent': ['profiles/dsh-coding/cordis.patch.yml'],
        'personal-assistant': ['profiles/dsh-lumi/cordis.patch.yml'],
      },
      cwd: projectRoot,
      dshHome: join(directory, 'dsh-home'),
      maxTokens: 1_024,
      model: 'deepseek-v4-flash',
      profile: 'sdk',
      provider: 'deepseek-official',
    })
    const runtime = createAssistantRuntime({
      cwd: projectRoot,
      dbPath: join(directory, 'assistant.db'),
      executor,
      httpToken: 'contract-token-0123456789abcdef12',
      principalId: 'contract-test',
    })
    runtimes.push(runtime)

    const app = buildGateway({ runtime })
    const response = await app.inject({
      method: 'POST',
      headers: {
        authorization: 'Bearer contract-token-0123456789abcdef12',
      },
      payload: {
        actorId: 'contract-test',
        channel: 'http',
        content: 'Implement a TypeScript parser',
        id: 'task-dsh-contract',
      },
      url: '/v1/tasks',
    })
    await app.close()
    const task = response.json().data.task

    expect(response.statusCode).toBe(201)
    expect(task).toMatchObject({
      capabilityId: 'coding-agent',
      dshSessionId: 'pa-task-dsh-contract',
      result: 'DSH main flow completed',
      state: 'completed',
    })
    expect(runtime.ledger.listEvents(task.id).map((event) => event.type))
      .toContain('execution.completed')
    expect(modelServer.requests).toHaveLength(1)
    expect(JSON.stringify(modelServer.requests[0]?.body))
      .toContain('coding specialist for lumi')
  }, 30_000)

  it('boots the DSH MiniMax catalog route without network access', async () => {
    vi.stubEnv('MINIMAX_CN_API_KEY', 'contract-key')

    const directory = temporaryDirectory('dsh-minimax-contract-')
    directories.push(directory)
    const harness = new DeepSeekHarness({
      cwd: projectRoot,
      dshHome: join(directory, 'dsh-home'),
      maxTokens: 1_024,
      model: 'MiniMax-M3',
      patches: [
        resolve(projectRoot, 'profiles/providers/minimax-cn.patch.yml'),
        resolve(projectRoot, 'profiles/dsh-coding/cordis.patch.yml'),
      ],
      profile: 'sdk',
      provider: 'minimax-cn',
    })
    try {
      await expect(harness.start()).resolves.toBeUndefined()
    } finally {
      await harness.close()
    }
  }, 30_000)

  it('fails before prompting the model when the protected plugin does not become ready', async () => {
    const directory = temporaryDirectory('dsh-bridge-not-ready-')
    directories.push(directory)
    const executor = new DshAdapter({
      actionBridgeCapabilities: ['personal-assistant'],
      actionBridgeReadyTimeoutMs: 50,
      actionBroker: {
        execute: async () => {
          throw new Error('not expected')
        },
        prepare: () => {
          throw new Error('not expected')
        },
      },
      capabilityPatchFiles: {
        'personal-assistant': ['profiles/dsh-coding/cordis.patch.yml'],
      },
      cwd: projectRoot,
      dshHome: join(directory, 'dsh-home'),
      profile: 'sdk',
    })

    await expect(executor.execute({
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
        actorId: 'contract-test',
        channel: 'test',
        content: 'Answer without a bridge.',
        id: 'task-dsh-bridge-not-ready',
      }),
    })).rejects.toThrow('plugin did not become ready')
  }, 30_000)

  it('loads the lumi Cordis bridge and prepares a sealed action through Host', async () => {
    const modelServer = await startMockLlmServer({
      apiKey: 'contract-key',
      sequence: ['tool_call_success', 'success'],
      successText: 'Prepared the action for review.',
      toolArguments: JSON.stringify({
        artifact_id: 'bridge-note',
        content: 'sealed bridge content',
        idempotency_key: 'bridge-note-1',
      }),
      toolName: 'lumi_artifact_prepare',
    })
    servers.push(modelServer)
    vi.stubEnv('DEEPSEEK_API_KEY', 'contract-key')
    vi.stubEnv('DEEPSEEK_BASE_URL', `${modelServer.baseURL}/v1`)
    vi.stubEnv('PA_EXECUTOR', 'dsh')

    const directory = temporaryDirectory('dsh-bridge-prepare-')
    directories.push(directory)
    vi.stubEnv('PA_DATA_DIR', directory)
    const runtime = createAssistantRuntime({
      artifactRoot: join(directory, 'artifacts'),
      cwd: projectRoot,
      dbPath: join(directory, 'assistant.db'),
      httpToken: 'contract-token-0123456789abcdef12',
      principalId: 'contract-test',
    })
    runtimes.push(runtime)

    const task = await runtime.core.submit(createTaskRequest({
      actorId: 'contract-test',
      channel: 'test',
      content: 'Prepare a private daily note for my review.',
      id: 'task-dsh-bridge-prepare',
    }))
    const actions = runtime.actions.list(runtime.identity.localPrincipal())

    expect(task).toMatchObject({
      capabilityId: 'personal-assistant',
      result: 'Prepared the action for review.',
      state: 'completed',
    })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      action: {
        status: 'prepared',
        target: { artifactId: 'bridge-note' },
      },
      authorization: null,
      receipt: null,
      verification: null,
    })
    expect(existsSync(join(directory, 'artifacts'))).toBe(false)
    expect(JSON.stringify(modelServer.requests[0]?.body))
      .toContain('"name":"lumi_artifact_prepare"')
    expect(JSON.stringify(modelServer.requests[0]?.body))
      .toContain('"name":"lumi_action_execute"')
    expect(runtime.ledger.listEvents(task.id)).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ actionId: actions[0]?.action.id }),
        type: 'action.prepared',
      }),
    )
    expect(runtime.ledger.listAudit(task.id)).toContainEqual(
      expect.objectContaining({
        action: 'dsh.bridge.prepare',
        detail: expect.objectContaining({ actionId: actions[0]?.action.id }),
      }),
    )
  }, 30_000)

  it('continues an authorized referenced action through the same Host broker', async () => {
    vi.stubEnv('PA_EXECUTOR', 'dsh')
    const directory = temporaryDirectory('dsh-bridge-execute-')
    directories.push(directory)
    vi.stubEnv('PA_DATA_DIR', directory)
    const artifactRoot = join(directory, 'artifacts')
    const runtime = createAssistantRuntime({
      artifactRoot,
      cwd: projectRoot,
      dbPath: join(directory, 'assistant.db'),
      httpToken: 'contract-token-0123456789abcdef12',
      principalId: 'contract-test',
    })
    runtimes.push(runtime)
    const principal = runtime.identity.localPrincipal()
    const prepared = runtime.actions.prepare(principal, {
      content: 'approved bridge content',
      idempotencyKey: 'bridge-execute-1',
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId: 'approved-note' },
    })
    runtime.actions.authorize(principal, prepared.action.id)

    const modelServer = await startMockLlmServer({
      apiKey: 'contract-key',
      sequence: ['tool_call_success', 'success'],
      successText: 'Executed and verified the approved action.',
      toolArguments: JSON.stringify({ action_id: prepared.action.id }),
      toolName: 'lumi_action_execute',
    })
    servers.push(modelServer)
    vi.stubEnv('DEEPSEEK_API_KEY', 'contract-key')
    vi.stubEnv('DEEPSEEK_BASE_URL', `${modelServer.baseURL}/v1`)

    const task = await runtime.core.submit(createTaskRequest({
      actorId: principal.id,
      channel: 'test',
      content: 'Complete the action I approved.',
      contextRefs: [`lumi-action:${prepared.action.id}`],
      id: 'task-dsh-bridge-execute',
    }))
    const detail = runtime.actions.get(principal, prepared.action.id)
    const files = readdirSync(artifactRoot)

    expect(task).toMatchObject({
      result: 'Executed and verified the approved action.',
      state: 'completed',
    })
    expect(detail.action.status).toBe('succeeded')
    expect(detail.authorization).toMatchObject({ remainingUses: 0, status: 'consumed' })
    expect(detail.verification?.status).toBe('passed')
    expect(files).toHaveLength(1)
    expect(readFileSync(join(artifactRoot, files[0] ?? ''), 'utf8'))
      .toBe('approved bridge content')
    expect(runtime.ledger.listEvents(task.id)).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ actionId: prepared.action.id }),
        type: 'action.succeeded',
      }),
    )
    expect(runtime.ledger.listAudit(task.id)).toContainEqual(
      expect.objectContaining({
        action: 'dsh.bridge.execute',
        detail: expect.objectContaining({ actionId: prepared.action.id }),
      }),
    )
  }, 30_000)

  it.each([
    {
      arguments: (target: string) => JSON.stringify({
        content: 'bypass',
        file_path: target,
      }),
      name: 'write',
    },
    {
      arguments: (target: string) => JSON.stringify({
        command: `printf bypass > ${JSON.stringify(target)}`,
        description: 'Attempt a direct file bypass.',
      }),
      name: 'bash',
    },
  ])('blocks the $name bypass before its tool body runs', async ({ arguments: args, name }) => {
    const directory = temporaryDirectory(`dsh-bridge-block-${name}-`)
    directories.push(directory)
    const marker = join(directory, `${name}-bypass.txt`)
    const modelServer = await startMockLlmServer({
      apiKey: 'contract-key',
      sequence: ['tool_call_success', 'success'],
      successText: `${name} was blocked.`,
      toolArguments: args(marker),
      toolName: name,
    })
    servers.push(modelServer)
    vi.stubEnv('DEEPSEEK_API_KEY', 'contract-key')
    vi.stubEnv('DEEPSEEK_BASE_URL', `${modelServer.baseURL}/v1`)
    vi.stubEnv('PA_DATA_DIR', directory)
    vi.stubEnv('PA_EXECUTOR', 'dsh')
    vi.stubEnv('PA_HTTP_TOKEN', 'host-secret-'.padEnd(43, 'x'))
    const runtime = createAssistantRuntime({
      cwd: projectRoot,
      dbPath: join(directory, 'assistant.db'),
      principalId: 'contract-test',
    })
    runtimes.push(runtime)

    const task = await runtime.core.submit(createTaskRequest({
      actorId: 'contract-test',
      channel: 'test',
      content: 'Give me a concise status update.',
      id: `task-dsh-bridge-block-${name}`,
    }))
    const completed = runtime.ledger.listEvents(task.id)
      .find(event => event.type === 'tool.completed')

    expect(task.state).toBe('completed')
    expect(completed?.payload).toMatchObject({ isError: true })
    expect(existsSync(marker)).toBe(false)
    expect(JSON.stringify(modelServer.requests)).not.toContain('host-secret-')
  }, 30_000)
})

function temporaryDirectory(prefix: string): string {
  mkdirSync(testDataRoot, { recursive: true })
  return mkdtempSync(join(testDataRoot, prefix))
}
