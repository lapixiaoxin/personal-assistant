import process from 'node:process'
import { URL } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'lumi-action-bridge'
export const inject = ['tools']

const BRIDGE_URL_ENV = 'LUMI_ACTION_BRIDGE_URL'
const BRIDGE_TOKEN_ENV = 'LUMI_ACTION_BRIDGE_TOKEN'
const REQUEST_TIMEOUT_MS = 10_000

export const allowedToolNames = Object.freeze([
  'create_goal',
  'get_goal',
  'glob',
  'grep',
  'interrupt_agent',
  'job_kill',
  'job_list',
  'job_output',
  'list_agents',
  'list_subagent_models',
  'lumi_action_execute',
  'lumi_artifact_prepare',
  'read',
  'read_image',
  'send_message',
  'skill',
  'subagent',
  'subagent_fork',
  'todo_write',
  'update_goal',
])

const allowedTools = new Set(allowedToolNames)

export function toolGuardReason(toolName) {
  if (allowedTools.has(toolName)) return undefined
  return `Tool "${toolName}" is disabled by the lumi protected profile. Use a lumi broker tool for side effects.`
}

export async function apply(ctx) {
  const connection = resolveBridgeEnvironment(process.env)
  ctx.tools.guard(execution => toolGuardReason(execution.name))

  ctx.tools.register(defineTool({
    name: 'lumi_artifact_prepare',
    description: 'Prepare a new local text artifact action for user review. This never authorizes or executes the action.',
    parameters: {
      artifact_id: {
        type: 'string',
        required: true,
        description: 'Stable artifact identifier using letters, digits, dot, underscore, or hyphen.',
      },
      content: {
        type: 'string',
        required: true,
        description: 'Complete text content to bind to the proposed action.',
      },
      deadline: {
        type: 'string',
        description: 'Optional RFC3339 deadline with an explicit UTC offset.',
      },
      idempotency_key: {
        type: 'string',
        required: true,
        description: 'Stable key for this exact artifact intent.',
      },
    },
    output: stringOutput(),
    async execute(args, execution) {
      return requestBridge(
        connection,
        '/v1/actions/prepare',
        {
          capability: { id: 'local-artifact', version: '1.0.0' },
          content: args.content,
          ...(args.deadline === undefined ? {} : { deadline: args.deadline }),
          idempotencyKey: args.idempotency_key,
          operation: 'artifact.write',
          schemaVersion: 'lumi.action-proposal/v1',
          target: { artifactId: args.artifact_id },
        },
        execution.signal,
      )
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lumi_action_execute',
    description: 'Execute a previously prepared and user-authorized lumi action referenced by this task.',
    parameters: {
      action_id: {
        type: 'string',
        required: true,
        description: 'Exact action ID supplied in a lumi-action context reference.',
      },
    },
    output: stringOutput(),
    async execute(args, execution) {
      return requestBridge(
        connection,
        `/v1/actions/${encodeURIComponent(args.action_id)}/execute`,
        {},
        execution.signal,
      )
    },
  }))

  await notifyBridgeReady(connection)
}

export function resolveBridgeEnvironment(environment) {
  const rawUrl = environment[BRIDGE_URL_ENV]
  const token = environment[BRIDGE_TOKEN_ENV]
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw new Error(`${BRIDGE_URL_ENV} is required`)
  }
  if (typeof token !== 'string' || token.length < 43 || token.length > 512) {
    throw new Error(`${BRIDGE_TOKEN_ENV} must contain between 43 and 512 characters`)
  }
  const url = new URL(rawUrl)
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || url.port === ''
    || url.username !== ''
    || url.password !== ''
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error(`${BRIDGE_URL_ENV} must be an http://127.0.0.1:<port>/ origin`)
  }
  return Object.freeze({ token, url: url.origin })
}

async function requestBridge(connection, path, body, callerSignal) {
  const signal = globalThis.AbortSignal.any([
    callerSignal,
    globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ])
  const response = await globalThis.fetch(new URL(path, `${connection.url}/`), {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    redirect: 'error',
    signal,
  })
  const payload = await response.json()
  if (!response.ok) {
    const error = recordValue(payload?.error)
    const code = typeof error?.code === 'string' ? error.code : 'BRIDGE_REJECTED'
    const message = typeof error?.message === 'string'
      ? error.message
      : 'The lumi action bridge rejected the request'
    throw new Error(`${code}: ${message}`)
  }
  const data = recordValue(payload?.data)
  if (typeof data?.actionId !== 'string' || typeof data.status !== 'string') {
    throw new Error('The lumi action bridge returned an invalid response')
  }
  return JSON.stringify(data)
}

async function notifyBridgeReady(connection) {
  const response = await globalThis.fetch(new URL('/v1/ready', `${connection.url}/`), {
    body: '{}',
    headers: {
      authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`The lumi action bridge readiness check failed with HTTP ${response.status}`)
  }
}

function stringOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  }
}

function recordValue(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined
}
