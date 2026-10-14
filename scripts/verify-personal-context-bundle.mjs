import { createServer } from 'node:net'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import {
  computePersonalContextRevision,
} from '../plugins/personal-context/src/plugin.js'

const root = resolve(import.meta.dirname, '..')
const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'lumi-personal-context-bundle-'))
const dshHome = resolve(temporaryRoot, 'dsh-home')
const packDirectory = resolve(temporaryRoot, 'pack')
const snapshotPath = resolve(temporaryRoot, 'personal-context.json')
const dsh = resolve(root, 'node_modules/.bin/dsh')
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('Bundle verification must run through pnpm')

const snapshotBase = {
  entries: [{
    content: 'Prefer concise validation summaries',
    id: 'memory-p0',
    kind: 'preference',
    revision: 1,
    scope: 'global',
    source: 'spec-0015-fixture',
  }],
  generatedAt: '2026-09-28T08:00:00.000Z',
  ownerId: 'owner-p0',
  purpose: 'general_assistance',
  schemaVersion: 'lumi.personal-context/v1',
}
const snapshot = {
  ...snapshotBase,
  revision: computePersonalContextRevision(snapshotBase),
}

try {
  mkdirSync(packDirectory, { recursive: true })
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })

  run(process.execPath, [
    pnpmCli,
    '--filter',
    '@lumi/personal-context-plugin',
    'pack',
    '--pack-destination',
    packDirectory,
  ])
  const tarballs = readdirSync(packDirectory).filter(name => name.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`Expected one bundle tarball, found ${tarballs.length}`)
  }
  const tarball = resolve(packDirectory, tarballs[0])
  const manifest = run('tar', ['-xOf', tarball, 'package/package.json']).stdout
  if (manifest.includes('workspace:')) {
    throw new Error('Packed personal-context manifest contains a workspace dependency')
  }
  for (const expected of [
    'package/cordis.patch.yml',
    'package/src/plugin.js',
    'package/src/plugin.d.ts',
  ]) {
    if (!run('tar', ['-tf', tarball]).stdout.includes(expected)) {
      throw new Error(`Packed personal-context bundle is missing ${expected}`)
    }
  }

  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    LUMI_OWNER_ID: 'owner-p0',
    LUMI_PERSONAL_CONTEXT_PATH: snapshotPath,
    NPM_CONFIG_CACHE: resolve(temporaryRoot, 'npm-cache'),
    PNPM_HOME: resolve(temporaryRoot, 'pnpm-home'),
    XDG_CACHE_HOME: resolve(temporaryRoot, 'xdg-cache'),
    XDG_DATA_HOME: resolve(temporaryRoot, 'xdg-data'),
    XDG_STATE_HOME: resolve(temporaryRoot, 'xdg-state'),
  }
  run(dsh, [
    '--profile',
    'lumi-p0',
    '--from-default-profile',
    'web',
    '--dump-config',
  ], env)
  run(dsh, ['plugin', '--profile', 'lumi-p0', 'add', tarball], env)
  const dump = run(dsh, ['--profile', 'lumi-p0', '--dump-config'], env).stdout
  for (const expected of [
    '@lumi/personal-context-plugin',
    'preset-lumi',
    'Personal agent using a portable lumi context snapshot',
  ]) {
    if (!dump.includes(expected)) {
      throw new Error(`Composed DSH config is missing ${expected}`)
    }
  }

  const profileManifest = readFileSync(
    resolve(dshHome, 'profiles/lumi-p0/package.json'),
    'utf8',
  )
  if (!profileManifest.includes('@lumi/personal-context-plugin')) {
    throw new Error('DSH profile manifest did not retain the installed lumi bundle')
  }

  const port = await reservePort()
  await verifyWebBoot(dsh, port, env)
  process.stdout.write(
    `DSH personal-context bundle verified: packed, installed, composed, and served on temporary port ${port}\n`,
  )
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true })
}

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  })
  if (result.status !== 0) {
    throw new Error([
      `Command failed (${result.status ?? 'signal'}): ${command} ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  return result
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolveReady, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveReady)
  })
  const address = server.address()
  if (typeof address === 'string' || address === null) {
    server.close()
    throw new Error('Failed to reserve a local TCP port')
  }
  await new Promise((resolveClosed, reject) => {
    server.close(error => error ? reject(error) : resolveClosed())
  })
  return address.port
}

async function verifyWebBoot(command, port, env) {
  const child = spawn(command, [
    '--profile',
    'lumi-p0',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let lastObservation = 'no HTTP response observed'
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })

  try {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`DSH Web exited before readiness (${child.exitCode})\n${output}`)
      }
      try {
        const printedUrl = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]
        const response = await globalThis.fetch(
          printedUrl ?? `http://127.0.0.1:${port}/`,
          { redirect: 'manual' },
        )
        const body = await response.text()
        lastObservation = `HTTP ${response.status}: ${body.slice(0, 160)}`
        if (
          printedUrl !== undefined
          && response.status === 303
          && response.headers.get('location') === './'
          && response.headers.has('set-cookie')
        ) return
        if (response.ok && /<html/i.test(body)) return
      } catch (error) {
        lastObservation = error instanceof Error ? error.message : String(error)
      }
      await new Promise(resolveDelay => globalThis.setTimeout(resolveDelay, 250))
    }
    throw new Error(
      `Timed out waiting for DSH Web on port ${port}: ${lastObservation}\n${output}`,
    )
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
    await new Promise(resolveExit => {
      if (child.exitCode !== null) return resolveExit()
      child.once('exit', resolveExit)
      globalThis.setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 5_000).unref()
    })
  }
}
