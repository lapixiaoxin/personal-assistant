import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const expected = 'dist/server/main.js'
if (!existsSync(resolve(root, expected))) throw new Error(`server build is missing ${expected}`)
const repositoryRuntime = [
  'host/src/plugin.js',
  'channels/feishu/src/index.js',
  'plugins/personal-context/src/plugin.js',
  'profiles/server/cordis.patch.yml',
]
for (const path of repositoryRuntime) {
  if (!existsSync(resolve(root, path))) {
    throw new Error(`repository deployment is missing runtime file ${path}`)
  }
}
const actual = readdirSync(resolve(root, 'dist'), { withFileTypes: true })
  .map(entry => entry.name)
  .sort()
if (actual.join('\n') !== 'server') {
  throw new Error(`server build contains unexpected top-level outputs: ${actual.join(', ')}`)
}
const launcher = readFileSync(resolve(root, expected), 'utf8')
const requireFromLauncher = createRequire(resolve(root, expected))
for (const match of launcher.matchAll(/from\s+"([^"]+)"/g)) {
  const specifier = match[1]
  if (specifier.startsWith('.') || specifier.startsWith('node:')
    || builtinModules.includes(specifier)) continue
  try {
    requireFromLauncher.resolve(specifier)
  } catch {
    throw new Error(`server launcher cannot resolve external dependency ${specifier}`)
  }
}

process.stdout.write('repository deployment and launcher build boundaries passed\n')
