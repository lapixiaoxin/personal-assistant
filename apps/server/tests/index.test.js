import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { childEnvironment } from '../src/index.js'
import { readServerConfig } from '../../../plugins/dsh-channels/src/config.js'

const dirs = []
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('server configuration boundary', () => {
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
})
