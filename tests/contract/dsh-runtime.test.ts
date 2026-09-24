import { mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startMockLlmServer, type MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { DshAdapter } from '../../adapters/dsh/src/index.ts'
import { buildGateway } from '../../apps/gateway/src/server.ts'
import { createAssistantRuntime, type AssistantRuntime } from '../../apps/runtime/src/index.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
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

    const directory = mkdtempSync(join(projectRoot, 'data/dsh-contract-'))
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
    })
    runtimes.push(runtime)

    const app = buildGateway({ runtime })
    const response = await app.inject({
      method: 'POST',
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

    const directory = mkdtempSync(join(projectRoot, 'data/dsh-minimax-contract-'))
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
})
