import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const pluginRequire = createRequire(resolve(root, 'plugins/dsh-action-bridge/package.json'))
const contextPluginRequire = createRequire(resolve(root, 'plugins/dsh-lumi/package.json'))
const lockfile = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8')

const [
  adapter,
  actionPlugin,
  contextPlugin,
  project,
  upstream,
  installedDsh,
  installedMockServer,
  installedSdk,
  installedSystemPrompt,
  installedTools,
] = await Promise.all([
  readJson(resolve(root, 'adapters/dsh/package.json')),
  readJson(resolve(root, 'plugins/dsh-action-bridge/package.json')),
  readJson(resolve(root, 'plugins/dsh-lumi/package.json')),
  readJson(resolve(root, 'package.json')),
  readJson(resolve(root, 'upstream.lock.json')),
  readJson(require.resolve('@deepseek-ai/dsh/package.json')),
  readJson(require.resolve('@deepseek-ai/dsh-llm-mock-server/package.json')),
  readJson(require.resolve('@deepseek-ai/dsh-sdk-client/package.json')),
  readJson(contextPluginRequire.resolve('@deepseek-ai/dsh-system-prompt/package.json')),
  readJson(pluginRequire.resolve('@deepseek-ai/dsh-tools/package.json')),
])

const declaredSdk = project.dependencies?.['@deepseek-ai/dsh-sdk-client']
const lockedSdk = upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-sdk-client']
const lockedDsh = upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh']
const lockedTools = upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-tools']
const bundledDsh = installedSdk.dependencies?.['@deepseek-ai/dsh']
const versions = {
  adapterSdk: adapter.dependencies?.['@deepseek-ai/dsh-sdk-client'],
  bundledDsh,
  declaredDsh: project.dependencies?.['@deepseek-ai/dsh'],
  declaredSdk,
  declaredMockServer: project.devDependencies?.['@deepseek-ai/dsh-llm-mock-server'],
  installedDsh: installedDsh.version,
  installedMockServer: installedMockServer.version,
  installedSdk: installedSdk.version,
  installedSystemPrompt: installedSystemPrompt.version,
  installedTools: installedTools.version,
  lockedDsh,
  lockedMockServer: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-llm-mock-server'],
  lockedSdk,
  lockedTools,
  actionPluginTools: actionPlugin.dependencies?.['@deepseek-ai/dsh-tools'],
  contextPluginSystemPrompt: contextPlugin.peerDependencies?.['@deepseek-ai/dsh-system-prompt'],
  contextPluginSystemPromptDev: contextPlugin.devDependencies?.['@deepseek-ai/dsh-system-prompt'],
  contextPluginTools: contextPlugin.peerDependencies?.['@deepseek-ai/dsh-tools'],
  contextPluginToolsDev: contextPlugin.devDependencies?.['@deepseek-ai/dsh-tools'],
  release: upstream.deepseekHarness?.version,
}

for (const [name, value] of Object.entries(versions)) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`DSH compatibility check: ${name} is not an exact version: ${String(value)}`)
  }
}

const expected = versions.release
for (const [name, value] of Object.entries(versions)) {
  if (value !== expected) {
    throw new Error(`DSH compatibility check: ${name}=${value} does not match ${expected}`)
  }
}

await assertCoreHasNoDshImports()
const lockedPackageCount = assertLockHasSingleDshRelease(lockfile, expected)
process.stdout.write(
  `DSH compatibility pins are aligned at ${expected}; ${lockedPackageCount} lockfile packages checked\n`,
)

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function assertCoreHasNoDshImports() {
  const protectedDirectories = [
    'packages/contracts',
    'packages/assistant-core',
    'packages/personal-context',
    'packages/personal-memory',
    'packages/policy',
    'packages/reminders',
    'packages/task-ledger',
    'packages/task-recovery',
  ]
  for (const directory of protectedDirectories) {
    for (const path of await sourceFiles(resolve(root, directory))) {
      if ((await readFile(path, 'utf8')).includes('@deepseek-ai/dsh')) {
        throw new Error(`DSH compatibility check: forbidden core import in ${path}`)
      }
    }
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  }))
  return files.flat()
}

function assertLockHasSingleDshRelease(lockfile, expected) {
  const packageStart = lockfile.indexOf('\npackages:\n')
  const snapshotStart = lockfile.indexOf('\nsnapshots:\n')
  if (packageStart < 0 || snapshotStart <= packageStart) {
    throw new Error('DSH compatibility check: lockfile package table is missing')
  }
  const packageTable = lockfile.slice(packageStart, snapshotStart)
  const versions = new Map()
  const packageEntry = /^ {2}'(@deepseek-ai\/dsh(?:-[^@']+)?)@([^']+)':$/gm
  for (const match of packageTable.matchAll(packageEntry)) {
    const name = match[1]
    const version = match[2]
    if (!name || !version) continue
    const current = versions.get(name) ?? new Set()
    current.add(version)
    versions.set(name, current)
  }
  if (versions.size === 0) {
    throw new Error('DSH compatibility check: lockfile contains no DSH packages')
  }
  const mismatches = []
  for (const [name, packageVersions] of versions) {
    for (const version of packageVersions) {
      if (version !== expected) mismatches.push(`${name}=${version}`)
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `DSH compatibility check: mixed lockfile releases: ${mismatches.sort().join(', ')}`,
    )
  }
  return versions.size
}
