import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { validateFeishuConfig } from '@lumi/feishu-channel'

export function assertPrivateFile(path, label) {
  assertRegularFile(path, label, 0o077, 'must not be accessible by group or other')
}

export function assertTrustedRuntimeFile(path, label) {
  assertRegularFile(path, label, 0o022, 'must not be writable by group or other')
}

export function readServerConfig(path) {
  const absolute = resolve(path)
  assertPrivateFile(absolute, 'Server configuration')
  let config
  try { config = JSON.parse(readFileSync(absolute, 'utf8')) } catch {
    throw new Error('Server configuration must be valid JSON')
  }
  const keys = ['schemaVersion', 'ownerId', 'dataDir', 'workspace', 'model', 'providerPatch',
    'personalContextPath', 'feishu', 'turnTimeoutMs']
  if (!config || config.schemaVersion !== 'lumi.server/v1'
    || Object.keys(config).some(key => !keys.includes(key))
    || typeof config.ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(config.ownerId)
    || typeof config.dataDir !== 'string' || !config.dataDir
    || typeof config.workspace !== 'string' || !config.workspace
    || typeof config.model?.provider !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.model.provider)
    || typeof config.model?.model !== 'string' || !config.model.model
    || !Number.isSafeInteger(config.model.maxTokens)
    || config.model.maxTokens < 1 || config.model.maxTokens > 32768
    || Object.keys(config.model).some(key => !['provider', 'model', 'maxTokens'].includes(key))
    || (config.turnTimeoutMs !== undefined && (!Number.isSafeInteger(config.turnTimeoutMs)
      || config.turnTimeoutMs < 1000 || config.turnTimeoutMs > 600_000))) {
    throw new Error('Invalid lumi.server/v1 configuration')
  }
  validateFeishuConfig(config.feishu)
  const base = dirname(absolute)
  for (const key of ['dataDir', 'workspace', 'providerPatch', 'personalContextPath']) {
    if (config[key] === undefined) continue
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`Invalid ${key}`)
    config[key] = resolve(base, config[key])
  }
  if (config.providerPatch) {
    assertTrustedRuntimeFile(config.providerPatch, 'Provider patch')
  }
  if (config.personalContextPath) {
    assertPrivateFile(config.personalContextPath, 'Personal context snapshot')
  }
  return config
}

function assertRegularFile(path, label, forbiddenMode, requirement) {
  let stat
  try {
    stat = statSync(path)
  } catch {
    throw new Error(`${label} must be an existing regular file`)
  }
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`)
  if ((stat.mode & forbiddenMode) !== 0) {
    throw new Error(`${label} permissions ${requirement}`)
  }
}
