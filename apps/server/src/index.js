import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { readServerConfig } from '@lumi/dsh-channels-plugin/config'

const CHILD_ENV_KEYS = [
  'PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL',
  'MINIMAX_API_KEY', 'MINIMAX_CN_API_KEY', 'LUMI_MODEL_API_KEY',
]

export function childEnvironment(parent, configPath, config) {
  const env = {}
  for (const key of CHILD_ENV_KEYS) {
    if (parent[key] !== undefined) env[key] = parent[key]
  }
  env.LUMI_SERVER_CONFIG = resolve(configPath)
  env.LUMI_OWNER_ID = config.ownerId
  if (config.personalContextPath) env.LUMI_PERSONAL_CONTEXT_PATH = config.personalContextPath
  return env
}

/** A process owner only: all conversations are hosted by the DSH plugin. */
export async function startServer(configPath, repositoryRoot = process.cwd()) {
  const config = readServerConfig(configPath)
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  mkdirSync(config.workspace, { recursive: true, mode: 0o700 })
  const patches = []
  if (config.providerPatch) {
    patches.push(config.providerPatch)
  } else if (['minimax', 'minimax-cn'].includes(config.model.provider)) {
    patches.push(resolve(repositoryRoot, `profiles/providers/${config.model.provider}.patch.yml`))
  }
  patches.push(resolve(repositoryRoot, 'profiles/server/cordis.patch.yml'))
  const harness = new DeepSeekHarness({
    cwd: config.workspace,
    processCwd: repositoryRoot,
    dshHome: join(config.dataDir, 'dsh'),
    profile: 'sdk',
    patches,
    env: childEnvironment(process.env, configPath, config),
    initializeTimeoutMs: 40_000,
    ...config.model,
  })
  try {
    await harness.start()
  } catch {
    await harness.close().catch(() => {})
    // SDK error text includes a child stderr tail, which may contain private data.
    throw new Error('DSH server startup failed; check configuration, model route and private status.json')
  }
  let stopping = false
  const monitor = harness.client.subscribe(() => false)
  const exited = monitor.next().catch(() => {
    if (!stopping) throw new Error('DSH server process exited unexpectedly')
  })
  // Let a caller attach its own exit observer without an unhandled-rejection race.
  void exited.catch(() => {})
  return {
    config,
    exited,
    async close() {
      stopping = true
      await harness.close()
      monitor.close()
      await exited
    },
  }
}
