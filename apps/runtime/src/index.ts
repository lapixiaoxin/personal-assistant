import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { AssistantCore, type TaskExecutor } from '@personal-assistant/assistant-core'
import {
  createDefaultCapabilityRegistry,
  RuleBasedRouter,
  type CapabilityRegistry,
} from '@personal-assistant/capability-registry'
import { DshAdapter, MockDshAdapter } from '@personal-assistant/dsh-adapter'
import { DefaultPolicyEngine, type PolicyEngine } from '@personal-assistant/policy'
import { SqliteTaskLedger, type TaskLedger } from '@personal-assistant/task-ledger'

export interface AssistantRuntime {
  capabilities: CapabilityRegistry
  core: AssistantCore
  executorKind: 'custom' | 'dsh' | 'mock'
  ledger: TaskLedger
  close(): Promise<void>
}

export interface RuntimeOptions {
  cwd?: string
  dbPath?: string
  executor?: TaskExecutor
  policy?: PolicyEngine
}

export interface DshModelConfiguration {
  model: string
  provider: string
  providerPatchFiles: string[]
}

export function loadLocalEnvironment(cwd: string = process.cwd()): void {
  try {
    loadEnvFile(resolve(cwd, '.env'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function createAssistantRuntime(options: RuntimeOptions = {}): AssistantRuntime {
  const cwd = resolve(options.cwd ?? process.cwd())
  const dataDir = resolve(process.env.PA_DATA_DIR ?? `${cwd}/data`)
  const ledger = new SqliteTaskLedger({
    filename: options.dbPath ?? `${dataDir}/assistant.db`,
  })
  const capabilities = createDefaultCapabilityRegistry()
  const router = new RuleBasedRouter(capabilities)
  const policy = options.policy ?? new DefaultPolicyEngine()
  const configured = options.executor
    ? { executor: options.executor, kind: 'custom' as const }
    : createConfiguredExecutor(cwd, dataDir)
  const { executor } = configured
  const core = new AssistantCore(ledger, router, policy, executor)

  return {
    capabilities,
    core,
    executorKind: configured.kind,
    ledger,
    close: () => core.close(),
  }
}

function createConfiguredExecutor(cwd: string, dataDir: string): {
  executor: TaskExecutor
  kind: 'dsh' | 'mock'
} {
  const executor = process.env.PA_EXECUTOR ?? 'dsh'
  if (executor === 'mock') return { executor: new MockDshAdapter(), kind: 'mock' }
  if (executor !== 'dsh') {
    throw new Error(`Unsupported PA_EXECUTOR: ${executor}`)
  }

  const maxTokens = process.env.PA_DSH_MAX_TOKENS
    ? Number.parseInt(process.env.PA_DSH_MAX_TOKENS, 10)
    : undefined
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
    throw new Error('PA_DSH_MAX_TOKENS must be a positive integer')
  }
  const modelConfiguration = resolveDshModelConfiguration()

  return {
    executor: new DshAdapter({
      capabilityPatchFiles: {
        'coding-agent': ['profiles/dsh-coding/cordis.patch.yml'],
        'personal-assistant': ['profiles/dsh-personal/cordis.patch.yml'],
      },
      cwd,
      dshHome: resolve(process.env.PA_DSH_HOME ?? `${dataDir}/dsh`),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      model: modelConfiguration.model,
      patchFiles: modelConfiguration.providerPatchFiles,
      ...(process.env.PA_DSH_PROFILE ? { profile: process.env.PA_DSH_PROFILE } : {}),
      provider: modelConfiguration.provider,
    }),
    kind: 'dsh',
  }
}

export function resolveDshModelConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): DshModelConfiguration {
  const provider = environment.PA_DSH_PROVIDER
    ?? (environment.MINIMAX_CN_API_KEY
      ? 'minimax-cn'
      : environment.MINIMAX_API_KEY
        ? 'minimax'
        : 'deepseek-official')
  const model = environment.PA_DSH_MODEL
    ?? (provider === 'minimax' || provider === 'minimax-cn'
      ? 'MiniMax-M3'
      : 'deepseek-v4-flash')
  const configuredPatch = environment.PA_DSH_PROVIDER_PATCH
  const providerPatchFiles = configuredPatch
    ? [configuredPatch]
    : provider === 'minimax'
      ? ['profiles/providers/minimax.patch.yml']
      : provider === 'minimax-cn'
        ? ['profiles/providers/minimax-cn.patch.yml']
        : []

  return { model, provider, providerPatchFiles }
}
