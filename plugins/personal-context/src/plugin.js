import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  computePersonalContextRevision,
  parsePersonalContextSnapshot,
  renderPersonalContext,
} from './domain/context-core.js'

export { computePersonalContextRevision, renderPersonalContext }

export const name = 'lumi-personal-context'
export const inject = ['systemPrompt', 'tools']

const PURPOSES = new Set(['general_assistance', 'coding', 'research', 'meeting'])
const IDENTIFIER = /^[^\s]{1,128}$/

export function apply(ctx, config) {
  const resolved = resolveConfig(config)
  loadPersonalContextSnapshot(resolved)

  ctx.effect(() => ctx.systemPrompt.context({
    name: 'lumi:personal-context',
    order: 500,
    text: () => renderPersonalContext(loadPersonalContextSnapshot(resolved)),
  }), 'lumi.personalContext()')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'lumi_context_status',
    description: 'Read metadata for the active portable lumi personal context. This never returns personal content.',
    parameters: {},
    output: stringOutput(),
    execute() {
      const snapshot = loadPersonalContextSnapshot(resolved)
      return JSON.stringify({
        entryCount: snapshot.entries.length,
        generatedAt: snapshot.generatedAt,
        purpose: snapshot.purpose,
        revision: snapshot.revision,
        schemaVersion: snapshot.schemaVersion,
      })
    },
  })), 'lumi.contextStatusTool()')
}

export function resolveConfig(config) {
  if (!isRecord(config)) throw new Error('lumi personal context config is required')
  assertExactKeys(config, ['ownerId', 'purpose', 'snapshotPath'], 'config')
  const ownerId = requiredIdentifier(config.ownerId, 'config.ownerId')
  const purpose = requiredEnum(config.purpose, PURPOSES, 'config.purpose')
  if (typeof config.snapshotPath !== 'string' || config.snapshotPath.trim() === '') {
    throw new Error('config.snapshotPath must be a non-empty path')
  }
  return Object.freeze({
    ownerId,
    purpose,
    snapshotPath: resolve(config.snapshotPath),
  })
}

export function loadPersonalContextSnapshot(config) {
  return parsePersonalContextSnapshot(
    JSON.parse(readFileSync(config.snapshotPath, 'utf8')),
    {
      ownerId: config.ownerId,
      purpose: config.purpose,
    },
  )
}

function stringOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  }
}

function assertExactKeys(record, expected, path) {
  const allowed = new Set(expected)
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${path} contains unknown field: ${key}`)
  }
  for (const key of expected) {
    if (!Object.hasOwn(record, key)) throw new Error(`${path} is missing field: ${key}`)
  }
}

function requiredIdentifier(value, path) {
  if (typeof value !== 'string' || value.trim() !== value || !IDENTIFIER.test(value)) {
    throw new Error(`${path} must be a non-empty identifier`)
  }
  return value
}

function requiredEnum(value, allowed, path) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${path} has an unsupported value: ${String(value)}`)
  }
  return value
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
