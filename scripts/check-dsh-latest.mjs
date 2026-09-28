import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const upstream = JSON.parse(await readFile(resolve(root, 'upstream.lock.json'), 'utf8'))
const release = upstream.deepseekHarness?.version
const packages = Object.keys(upstream.deepseekHarness?.packages ?? {})
if (typeof release !== 'string' || packages.length === 0) {
  throw new Error('DSH latest check: upstream.lock.json has no pinned release')
}

const registry = (process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmjs.org')
  .replace(/\/+$/, '')
const metadata = new Map()
for (const packageName of packages) {
  metadata.set(packageName, await fetchPackageMetadata(packageName))
}

const harness = metadata.get('@deepseek-ai/dsh')
const latest = harness?.['dist-tags']?.latest
if (typeof latest !== 'string') {
  throw new Error('DSH latest check: registry metadata has no dsh latest tag')
}
if (latest !== release) {
  throw new Error(
    `DSH latest check: pinned release ${release} is behind registry latest ${latest}`,
  )
}

for (const packageName of packages) {
  const versions = metadata.get(packageName)?.versions
  if (typeof versions !== 'object' || versions === null || !(release in versions)) {
    throw new Error(
      `DSH latest check: ${packageName} does not publish compatible release ${release}`,
    )
  }
}

process.stdout.write(
  `DSH registry freshness passed: latest=${latest}, ${packages.length} compatible packages\n`,
)

async function fetchPackageMetadata(packageName) {
  const controller = new globalThis.AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await globalThis.fetch(
      `${registry}/${packageName.replace('/', '%2f')}`,
      {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      throw new Error(
        `DSH latest check: registry returned HTTP ${response.status} for ${packageName}`,
      )
    }
    return await response.json()
  } catch (error) {
    throw new Error(
      `DSH latest check: failed to query ${packageName}: ${errorMessage(error)}`,
      { cause: error },
    )
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
