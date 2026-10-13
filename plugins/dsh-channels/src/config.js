import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { validateFeishuConfig } from '@lumi/feishu-channel'

export function readServerConfig(path) {
  const absolute = resolve(path)
  if ((statSync(absolute).mode & 0o077) !== 0) {
    throw new Error('Server configuration contains credentials; set its permissions to 600')
  }
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
    || typeof config.model?.provider !== 'string' || !config.model.provider
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
  return config
}
