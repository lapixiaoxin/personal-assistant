import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const pluginRequire = createRequire(resolve(root, 'plugins/dsh-action-bridge/package.json'))

const [
  adapter,
  plugin,
  project,
  upstream,
  installedMockServer,
  installedSdk,
  installedTools,
] = await Promise.all([
  readJson(resolve(root, 'adapters/dsh/package.json')),
  readJson(resolve(root, 'plugins/dsh-action-bridge/package.json')),
  readJson(resolve(root, 'package.json')),
  readJson(resolve(root, 'upstream.lock.json')),
  readJson(require.resolve('@deepseek-ai/dsh-llm-mock-server/package.json')),
  readJson(require.resolve('@deepseek-ai/dsh-sdk-client/package.json')),
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
  installedMockServer: installedMockServer.version,
  installedSdk: installedSdk.version,
  installedTools: installedTools.version,
  lockedDsh,
  lockedMockServer: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-llm-mock-server'],
  lockedSdk,
  lockedTools,
  pluginTools: plugin.dependencies?.['@deepseek-ai/dsh-tools'],
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
process.stdout.write(`DSH compatibility pins are aligned at ${expected}\n`)

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function assertCoreHasNoDshImports() {
  const protectedDirectories = [
    'packages/contracts',
    'packages/assistant-core',
    'packages/policy',
    'packages/task-ledger',
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
