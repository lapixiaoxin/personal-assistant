import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { ActionService, type ActionServiceOptions } from '@lumi/action-runtime'
import { AssistantCore, type TaskExecutor } from '@lumi/assistant-core'
import {
  createDefaultCapabilityRegistry,
  RuleBasedRouter,
  type CapabilityRegistry,
} from '@lumi/capability-registry'
import {
  DshAdapter,
  MockDshAdapter,
  type DshActionBroker,
  type DshResearchBroker,
} from '@lumi/dsh-adapter'
import {
  LocalIdentityAuthority,
  type IdentityAuthority,
} from '@lumi/identity'
import {
  MeetingBriefExecutor,
  MeetingBriefWorkflow,
} from '@lumi/meeting-workflow'
import {
  LocalArtifactProvider,
  type ArtifactProvider,
} from '@lumi/local-artifact'
import {
  MemoryContextExecutor,
  PersonalMemoryService,
  SqlitePersonalMemoryStore,
  type PersonalMemoryStore,
} from '@lumi/personal-memory'
import {
  DefaultActionPolicyEngine,
  DefaultPolicyEngine,
  type ActionPolicyEngine,
  type PolicyEngine,
} from '@lumi/policy'
import {
  HttpsPublicSourceFetcher,
  LocalResearchSourceStore,
} from '@lumi/research-sources'
import {
  ResearchBriefWorkflow,
  ResearchEvidenceExecutor,
  ResearchSourceService,
  type PublicSourceFetcher,
  type ResearchSourceStore,
} from '@lumi/research-workflow'
import {
  RecoveryService,
  type RecoveryStartupReport,
} from '@lumi/task-recovery'
import {
  SqliteTaskLedger,
  type ActionLedger,
  type RecoveryLedger,
  type TaskLedger,
} from '@lumi/task-ledger'

export interface AssistantRuntime {
  actions: ActionService
  capabilities: CapabilityRegistry
  core: AssistantCore
  executorKind: 'custom' | 'dsh' | 'mock'
  identity: IdentityAuthority
  ledger: ActionLedger & RecoveryLedger & TaskLedger
  memories: PersonalMemoryService
  meeting: MeetingBriefWorkflow
  ready: Promise<RecoveryStartupReport>
  recovery: RecoveryService
  research: ResearchBriefWorkflow
  close(): Promise<void>
}

export interface RuntimeOptions {
  actionPolicy?: ActionPolicyEngine
  actionService?: Pick<ActionServiceOptions, 'afterProviderWrite' | 'authorizationTtlMs' | 'now'>
  artifactProvider?: ArtifactProvider
  artifactRoot?: string
  cwd?: string
  dbPath?: string
  executor?: TaskExecutor
  httpToken?: string
  identity?: IdentityAuthority
  memoryStore?: PersonalMemoryStore
  ownerId?: string
  policy?: PolicyEngine
  principalId?: string
  publicSourceFetcher?: PublicSourceFetcher
  researchRoot?: string
  researchSourceStore?: ResearchSourceStore
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
  const dbPath = options.dbPath ?? `${dataDir}/assistant.db`
  const ledger = new SqliteTaskLedger({
    filename: dbPath,
  })
  const capabilities = createDefaultCapabilityRegistry()
  const router = new RuleBasedRouter(capabilities)
  const policy = options.policy ?? new DefaultPolicyEngine()
  const actionPolicy = options.actionPolicy ?? new DefaultActionPolicyEngine()
  const httpToken = options.httpToken ?? process.env.PA_HTTP_TOKEN
  const identity = options.identity ?? new LocalIdentityAuthority({
    ...(httpToken ? { httpToken } : {}),
    ownerId: options.ownerId ?? process.env.PA_OWNER_ID ?? 'local-owner',
    principalId: options.principalId ?? process.env.PA_PRINCIPAL_ID ?? 'local-user',
  })
  const memoryStore = options.memoryStore ?? new SqlitePersonalMemoryStore({
    filename: dbPath,
  })
  const memories = new PersonalMemoryService(memoryStore)
  const provider = options.artifactProvider ?? new LocalArtifactProvider(
    resolve(options.artifactRoot ?? process.env.PA_ARTIFACT_ROOT ?? `${dataDir}/artifacts`),
  )
  const actions = new ActionService({
    ledger,
    policy: actionPolicy,
    provider,
    ...options.actionService,
  })
  const researchSources = new ResearchSourceService({
    fetcher: options.publicSourceFetcher ?? new HttpsPublicSourceFetcher(),
    ledger,
    store: options.researchSourceStore ?? new LocalResearchSourceStore(
      resolve(options.researchRoot ?? process.env.PA_RESEARCH_ROOT ?? `${dataDir}/research/sources`),
    ),
  })
  const configured = options.executor
    ? { executor: options.executor, kind: 'custom' as const }
    : createConfiguredExecutor(
        cwd,
        dataDir,
        createDshActionBroker(actions, ledger, identity),
        createDshResearchBroker(researchSources, identity),
      )
  const memoryExecutor = new MemoryContextExecutor(
    configured.executor,
    memories,
    ledger,
    identity.localPrincipal().ownerId,
  )
  const executor = new MeetingBriefExecutor(
    new ResearchEvidenceExecutor(memoryExecutor, ledger),
    ledger,
  )
  const core = new AssistantCore(ledger, router, policy, executor)
  const meeting = new MeetingBriefWorkflow(core)
  const research = new ResearchBriefWorkflow(core)
  const recovery = new RecoveryService({
    actions,
    core,
    ledger,
  })
  const ready = recovery.initialize(identity.localPrincipal())

  return {
    actions,
    capabilities,
    core,
    executorKind: configured.kind,
    identity,
    ledger,
    memories,
    meeting,
    ready,
    recovery,
    research,
    close: async () => {
      try {
        await ready
      } finally {
        try {
          await core.close()
        } finally {
          memories.close()
        }
      }
    },
  }
}

function createDshActionBroker(
  actions: ActionService,
  ledger: ActionLedger & TaskLedger,
  identity: IdentityAuthority,
): DshActionBroker {
  return {
    async execute(actionId, invocation) {
      const principal = identity.localPrincipal()
      try {
        const detail = await actions.execute(principal, actionId)
        const verified = detail.action.status === 'succeeded'
          && detail.verification?.status === 'passed'
        ledger.appendEvent(
          invocation.sourceTaskId,
          verified ? 'action.succeeded' : 'verification.completed',
          {
            actionDigest: detail.action.actionDigest,
            actionId: detail.action.id,
            status: detail.action.status,
            verificationId: detail.verification?.id ?? null,
            verificationStatus: detail.verification?.status ?? null,
          },
        )
        ledger.appendAudit({
          action: 'dsh.bridge.execute',
          actorId: principal.id,
          detail: {
            actionDigest: detail.action.actionDigest,
            actionId: detail.action.id,
            status: detail.action.status,
            verificationStatus: detail.verification?.status ?? null,
          },
          outcome: verified ? 'succeeded' : 'failed',
          targetId: invocation.sourceTaskId,
        })
        return detail
      } catch (error) {
        ledger.appendAudit({
          action: 'dsh.bridge.execute',
          actorId: principal.id,
          detail: {
            actionId,
            code: errorCode(error),
          },
          outcome: 'denied',
          targetId: invocation.sourceTaskId,
        })
        throw error
      }
    },
    prepare(input, invocation) {
      const principal = identity.localPrincipal()
      const detail = actions.prepare(principal, input)
      ledger.appendEvent(invocation.sourceTaskId, 'action.prepared', {
        actionDigest: detail.action.actionDigest,
        actionId: detail.action.id,
        status: detail.action.status,
      })
      ledger.appendAudit({
        action: 'dsh.bridge.prepare',
        actorId: principal.id,
        detail: {
          actionDigest: detail.action.actionDigest,
          actionId: detail.action.id,
          status: detail.action.status,
        },
        outcome: 'requested',
        targetId: invocation.sourceTaskId,
      })
      return detail
    },
  }
}

function createDshResearchBroker(
  sources: ResearchSourceService,
  identity: IdentityAuthority,
): DshResearchBroker {
  return {
    capture(input, invocation, signal) {
      return sources.capture(identity.localPrincipal(), input, invocation, signal)
    },
  }
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code')
    if (typeof code === 'string') return code
  }
  return 'BRIDGE_FAILURE'
}

function createConfiguredExecutor(
  cwd: string,
  dataDir: string,
  actionBroker: DshActionBroker,
  researchBroker: DshResearchBroker,
): {
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
      actionBridgeCapabilities: ['personal-assistant'],
      actionBroker,
      capabilityPatchFiles: {
        'coding-agent': ['profiles/dsh-coding/cordis.patch.yml'],
        'meeting-agent': ['profiles/dsh-meeting/cordis.patch.yml'],
        'personal-assistant': ['profiles/dsh-lumi/cordis.patch.yml'],
        'research-agent': ['profiles/dsh-research/cordis.patch.yml'],
      },
      cwd,
      dshHome: resolve(process.env.PA_DSH_HOME ?? `${dataDir}/dsh`),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      model: modelConfiguration.model,
      patchFiles: modelConfiguration.providerPatchFiles,
      ...(process.env.PA_DSH_PROFILE ? { profile: process.env.PA_DSH_PROFILE } : {}),
      protectedBridgeCapabilities: [
        'meeting-agent',
        'personal-assistant',
        'research-agent',
      ],
      provider: modelConfiguration.provider,
      researchBridgeCapabilities: ['research-agent'],
      researchBroker,
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
