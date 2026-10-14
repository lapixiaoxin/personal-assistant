import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const hostRequire = createRequire(resolve(root, 'host/package.json'))
const contextRequire = createRequire(resolve(root, 'plugins/personal-context/package.json'))
const project = await readJson(resolve(root, 'package.json'))
const upstream = await readJson(resolve(root, 'upstream.lock.json'))
const host = await readJson(resolve(root, 'host/package.json'))
const contextPlugin = await readJson(resolve(root, 'plugins/personal-context/package.json'))
const installed = {
  dsh: await readJson(require.resolve('@deepseek-ai/dsh/package.json')),
  llm: await readJson(hostRequire.resolve('@deepseek-ai/dsh-llm/package.json')),
  mock: await readJson(require.resolve('@deepseek-ai/dsh-llm-mock-server/package.json')),
  sdk: await readJson(require.resolve('@deepseek-ai/dsh-sdk-client/package.json')),
  systemPrompt: await readJson(contextRequire.resolve('@deepseek-ai/dsh-system-prompt/package.json')),
  tools: await readJson(contextRequire.resolve('@deepseek-ai/dsh-tools/package.json')),
}
const expected = upstream.deepseekHarness?.version
const versions = {
  rootDsh: project.dependencies?.['@deepseek-ai/dsh'],
  rootSdk: project.dependencies?.['@deepseek-ai/dsh-sdk-client'],
  rootMock: project.devDependencies?.['@deepseek-ai/dsh-llm-mock-server'],
  hostLlm: host.dependencies?.['@deepseek-ai/dsh-llm'],
  contextSystemPrompt: contextPlugin.peerDependencies?.['@deepseek-ai/dsh-system-prompt'],
  contextTools: contextPlugin.peerDependencies?.['@deepseek-ai/dsh-tools'],
  contextSystemPromptDev: contextPlugin.devDependencies?.['@deepseek-ai/dsh-system-prompt'],
  contextToolsDev: contextPlugin.devDependencies?.['@deepseek-ai/dsh-tools'],
  installedDsh: installed.dsh.version,
  installedLlm: installed.llm.version,
  installedMock: installed.mock.version,
  installedSdk: installed.sdk.version,
  installedSystemPrompt: installed.systemPrompt.version,
  installedTools: installed.tools.version,
  lockedDsh: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh'],
  lockedMock: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-llm-mock-server'],
  lockedSdk: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-sdk-client'],
  lockedTools: upstream.deepseekHarness?.packages?.['@deepseek-ai/dsh-tools'],
}

if (typeof expected !== 'string') throw new Error('DSH compatibility check: missing release')
for (const [name, version] of Object.entries(versions)) {
  if (version !== expected) {
    throw new Error(`DSH compatibility check: ${name}=${String(version)} does not match ${expected}`)
  }
}

await assertWorkspaceDeclarations(expected)
await assertPluginDomainsDoNotImportExternalSdks()
const lockfile = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8')
const count = assertLockHasSingleRelease(lockfile, expected)
process.stdout.write(`DSH compatibility pins are aligned at ${expected}; ${count} lockfile packages checked\n`)

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function assertWorkspaceDeclarations(release) {
  const manifests = [resolve(root, 'host/package.json')]
  for (const category of ['channels', 'plugins']) {
    for (const entry of await readdir(resolve(root, category), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      manifests.push(resolve(root, category, entry.name, 'package.json'))
    }
  }
  for (const path of manifests) {
    let manifest
    try {
      manifest = await readJson(path)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[group] ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh') && version !== release) {
          throw new Error(`DSH compatibility check: ${manifest.name} ${group} ${name}=${version}`)
        }
      }
    }
  }
}

async function assertPluginDomainsDoNotImportExternalSdks() {
  const directory = resolve(root, 'plugins/personal-context/src/domain')
  for (const path of await sourceFiles(directory)) {
    const source = await readFile(path, 'utf8')
    if (source.includes('@deepseek-ai/') || source.includes('@larksuiteoapi/')) {
      throw new Error(`DSH compatibility check: forbidden plugin-domain SDK import in ${path}`)
    }
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && /\.(?:js|ts)$/.test(entry.name) ? [path] : []
  }))
  return files.flat()
}

function assertLockHasSingleRelease(lockfile, release) {
  const packageStart = lockfile.indexOf('\npackages:\n')
  const snapshotStart = lockfile.indexOf('\nsnapshots:\n')
  if (packageStart < 0 || snapshotStart <= packageStart) {
    throw new Error('DSH compatibility check: lockfile package table is missing')
  }
  const versions = new Map()
  const entries = lockfile.slice(packageStart, snapshotStart)
    .matchAll(/^ {2}'(@deepseek-ai\/dsh(?:-[^@']+)?)@([^']+)':$/gm)
  for (const match of entries) {
    const name = match[1]
    const version = match[2]
    if (!name || !version) continue
    const found = versions.get(name) ?? new Set()
    found.add(version)
    versions.set(name, found)
  }
  if (versions.size === 0) throw new Error('DSH compatibility check: no DSH packages')
  const mismatches = []
  for (const [name, found] of versions) {
    for (const version of found) if (version !== release) mismatches.push(`${name}=${version}`)
  }
  if (mismatches.length > 0) {
    throw new Error(`DSH compatibility check: mixed releases: ${mismatches.sort().join(', ')}`)
  }
  return versions.size
}
