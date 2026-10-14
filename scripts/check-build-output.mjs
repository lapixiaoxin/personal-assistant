import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2]
const contracts = {
  legacy: {
    expected: ['dist/cli/main.js', 'dist/gateway/main.js', 'dist/workbench/index.html'],
    topLevel: ['cli', 'gateway', 'workbench'],
  },
  server: {
    expected: ['dist/server/main.js'],
    topLevel: ['server'],
  },
}
const contract = contracts[mode]
if (!contract) throw new Error('Usage: check-build-output.mjs <server|legacy>')

for (const path of contract.expected) {
  if (!existsSync(resolve(root, path))) throw new Error(`${mode} build is missing ${path}`)
}
const actual = readdirSync(resolve(root, 'dist'), { withFileTypes: true })
  .map(entry => entry.name)
  .sort()
if (actual.join('\n') !== contract.topLevel.join('\n')) {
  throw new Error(`${mode} build contains unexpected top-level outputs: ${actual.join(', ')}`)
}

process.stdout.write(`${mode} build boundary passed: ${actual.join(', ')}\n`)
