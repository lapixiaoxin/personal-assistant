import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { childEnvironment, resolveProviderPatches } from '../src/server.js'
import { readServerConfig } from '../src/config.js'

const dirs = []
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('host configuration boundary', () => {
  it('never forwards inherited platform credentials or Node code injection variables', () => {
    const result = childEnvironment({
      PATH: '/bin', HOME: '/synthetic-home', MINIMAX_CN_API_KEY: 'model-key',
      PA_HTTP_TOKEN: 'private-http', FEISHU_APP_SECRET: 'platform-key',
      LARK_USER_ACCESS_TOKEN: 'user-token', NODE_OPTIONS: '--import malicious.js',
      LUMI_PERSONAL_CONTEXT_PATH: 'untrusted-path', OTHER_API_KEY: 'unrelated-key',
    }, '/trusted/config.json', { ownerId: 'owner' })
    expect(result).toEqual({
      PATH: '/bin', HOME: '/synthetic-home', MINIMAX_CN_API_KEY: 'model-key',
      LUMI_SERVER_CONFIG: '/trusted/config.json', LUMI_OWNER_ID: 'owner',
    })
  })

  it('requires private credentials, resolves paths from the config, and rejects unknown options', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lumi-config-'))
    dirs.push(dir)
    const path = join(dir, 'config.json')
    const config = {
      schemaVersion: 'lumi.server/v1', ownerId: 'owner', dataDir: '.', workspace: './workspace',
      model: { provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 1024 },
      feishu: { appId: 'cli_test', appSecret: 'synthetic-secret', ownerOpenId: 'ou_owner' },
    }
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 })
    expect(readServerConfig(path).workspace).toBe(join(dir, 'workspace'))
    chmodSync(path, 0o644)
    expect(() => readServerConfig(path)).toThrow('permissions')
    chmodSync(path, 0o600)
    writeFileSync(path, JSON.stringify({ ...config, autoApprove: true }))
    expect(() => readServerConfig(path)).toThrow('Invalid')
  })

  it('checks custom runtime files according to their trust boundary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lumi-config-files-'))
    dirs.push(dir)
    const path = join(dir, 'config.json')
    const providerPatch = join(dir, 'provider.patch.yml')
    const personalContextPath = join(dir, 'context.json')
    const config = {
      schemaVersion: 'lumi.server/v1', ownerId: 'owner', dataDir: '.', workspace: './workspace',
      model: { provider: 'custom-provider', model: 'custom-model', maxTokens: 1024 },
      providerPatch: './provider.patch.yml',
      personalContextPath: './context.json',
      feishu: { appId: 'cli_test', appSecret: 'synthetic-secret', ownerOpenId: 'ou_owner' },
    }
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 })
    writeFileSync(providerPatch, '[]\n', { mode: 0o666 })
    chmodSync(providerPatch, 0o666)
    writeFileSync(personalContextPath, '{}\n', { mode: 0o600 })
    expect(() => readServerConfig(path)).toThrow('Provider patch permissions')
    chmodSync(providerPatch, 0o644)
    chmodSync(personalContextPath, 0o644)
    expect(() => readServerConfig(path)).toThrow('Personal context snapshot permissions')
    chmodSync(personalContextPath, 0o600)
    expect(readServerConfig(path)).toMatchObject({ providerPatch, personalContextPath })
  })

  it('discovers a tracked provider profile and rejects writable definitions', () => {
    const root = mkdtempSync(join(tmpdir(), 'lumi-provider-profiles-'))
    dirs.push(root)
    const profiles = join(root, 'profiles/providers')
    mkdirSync(profiles, { recursive: true })
    const profile = join(profiles, 'example-provider.patch.yml')
    writeFileSync(profile, '[]\n', { mode: 0o644 })
    const config = {
      model: { provider: 'example-provider' },
    }
    expect(resolveProviderPatches(config, root)).toEqual([profile])
    chmodSync(profile, 0o666)
    expect(() => resolveProviderPatches(config, root)).toThrow('permissions')
    expect(resolveProviderPatches({
      model: { provider: 'catalog-provider' },
    }, root)).toEqual([])
  })
})
