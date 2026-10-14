import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const expected = 'dist/server/main.js'
if (!existsSync(resolve(root, expected))) throw new Error(`server build is missing ${expected}`)
const actual = readdirSync(resolve(root, 'dist'), { withFileTypes: true })
  .map(entry => entry.name)
  .sort()
if (actual.join('\n') !== 'server') {
  throw new Error(`server build contains unexpected top-level outputs: ${actual.join(', ')}`)
}

process.stdout.write('server build boundary passed\n')
