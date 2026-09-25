import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import {
  ActionProposalSubmissionSchema,
  type ActionDetail,
  type ActionProposalSubmission,
  type JsonValue,
} from '@lumi/contracts'
import {
  researchSourceUrlsFromContextRefs,
  ResearchFetchSubmissionSchema,
  type ResearchFetchSubmission,
  type ResearchSourceRecord,
} from '@lumi/research-workflow'

const MAX_REQUEST_BYTES = 1_100_000
const ACTION_REFERENCE = /^lumi-action:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/

export interface DshActionBroker {
  execute(actionId: string, invocation: DshBrokerInvocation): Promise<ActionDetail>
  prepare(input: ActionProposalSubmission, invocation: DshBrokerInvocation): ActionDetail
}

export interface DshResearchBroker {
  capture(
    input: ResearchFetchSubmission,
    invocation: DshBrokerInvocation,
    signal: AbortSignal,
  ): Promise<ResearchSourceRecord>
}

export interface DshBrokerInvocation {
  sourceTaskId: string
}

export interface DshActionBridgeRun {
  readonly environment: Readonly<Record<string, string>>
  readonly url: string
  close(): Promise<void>
  waitUntilReady(timeoutMs?: number): Promise<void>
}

export interface DshActionBridgeOptions {
  broker: DshActionBroker
  contextRefs: readonly string[]
  enableActions?: boolean
  researchBroker?: DshResearchBroker
  taskId: string
}

export async function startDshActionBridge(
  options: DshActionBridgeOptions,
): Promise<DshActionBridgeRun> {
  const token = randomBytes(32).toString('base64url')
  const tokenDigest = digestToken(token)
  const allowedActionIds = actionIdsFromContextRefs(options.contextRefs)
  const allowedResearchSources = new Set(researchSourceUrlsFromContextRefs(options.contextRefs))
  const activeRequests = new Set<AbortController>()
  let markReady: (() => void) | undefined
  let ready = false
  const readySignal = new Promise<void>((resolveReady) => {
    markReady = resolveReady
  })
  const server = createServer((request, response) => {
    const controller = new AbortController()
    activeRequests.add(controller)
    response.once('close', () => {
      if (!response.writableEnded) controller.abort()
      activeRequests.delete(controller)
    })
    void handleRequest({
      actionBroker: options.broker,
      actionsEnabled: options.enableActions !== false,
      allowedActionIds,
      allowedResearchSources,
      invocation: { sourceTaskId: options.taskId },
      markReady: () => {
        ready = true
        markReady?.()
      },
      ...(options.researchBroker ? { researchBroker: options.researchBroker } : {}),
      request,
      response,
      signal: controller.signal,
      tokenDigest,
    }).finally(() => activeRequests.delete(controller))
  })
  await listen(server)
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('DSH action bridge did not bind a TCP address')
  }
  const url = `http://127.0.0.1:${address.port}`
  let closed = false

  return {
    environment: {
      LUMI_ACTION_BRIDGE_TOKEN: token,
      LUMI_ACTION_BRIDGE_URL: url,
      ...(options.enableActions === false ? { LUMI_ACTION_BRIDGE_ENABLED: '0' } : {}),
      ...(options.researchBroker ? { LUMI_RESEARCH_BRIDGE_ENABLED: '1' } : {}),
    },
    url,
    async close() {
      if (closed) return
      closed = true
      for (const controller of activeRequests) controller.abort()
      await closeServer(server)
    },
    async waitUntilReady(timeoutMs = 5_000) {
      if (ready) return
      if (closed) throw new Error('DSH action bridge closed before the plugin became ready')
      await Promise.race([
        readySignal,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error('DSH action bridge plugin did not become ready')),
            timeoutMs,
          ).unref()
        }),
      ])
    },
  }
}

export function actionIdsFromContextRefs(references: readonly string[]): ReadonlySet<string> {
  return new Set(references.flatMap((reference) => {
    const match = ACTION_REFERENCE.exec(reference)
    return match?.[1] ? [match[1]] : []
  }))
}

export function createDshChildEnvironment(
  parent: NodeJS.ProcessEnv,
  additions: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(parent).filter(([key, value]) =>
      value !== undefined
      && !key.startsWith('PA_')
      && !key.startsWith('LUMI_ACTION_BRIDGE_')
      && !key.startsWith('LUMI_RESEARCH_BRIDGE_')),
  )
  return { ...environment, ...additions }
}

interface BridgeRequestContext {
  actionBroker: DshActionBroker
  actionsEnabled: boolean
  allowedActionIds: ReadonlySet<string>
  allowedResearchSources: ReadonlySet<string>
  invocation: DshBrokerInvocation
  markReady: () => void
  researchBroker?: DshResearchBroker
  request: IncomingMessage
  response: ServerResponse
  signal: AbortSignal
  tokenDigest: Buffer
}

async function handleRequest(context: BridgeRequestContext): Promise<void> {
  const { request, response } = context
  try {
    requireAuthorization(request, context.tokenDigest)
    requireJsonRequest(request)
    const target = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (target.search !== '') {
      throw new BridgeRequestError(404, 'INVALID_INPUT', 'Bridge route not found')
    }
    const path = target.pathname

    if (path === '/v1/ready') {
      requireMethod(request, 'POST')
      await readEmptyJsonObject(request)
      context.markReady()
      sendJson(response, 200, { data: { ready: true } })
      return
    }

    if (path === '/v1/actions/prepare') {
      requireMethod(request, 'POST')
      if (context.actionsEnabled === false) {
        throw new BridgeRequestError(
          403,
          'PERMISSION_DENIED',
          'Action access is not enabled for this DSH task',
        )
      }
      const proposal = ActionProposalSubmissionSchema.parse(await readJsonBody(request))
      sendJson(response, 202, {
        data: summarizeAction(context.actionBroker.prepare(proposal, context.invocation)),
      })
      return
    }

    if (path === '/v1/research/fetch') {
      requireMethod(request, 'POST')
      if (!context.researchBroker) {
        throw new BridgeRequestError(
          403,
          'PERMISSION_DENIED',
          'Research source access is not enabled for this DSH task',
        )
      }
      const submission = ResearchFetchSubmissionSchema.parse(await readJsonBody(request))
      if (!context.allowedResearchSources.has(submission.url)) {
        throw new BridgeRequestError(
          403,
          'PERMISSION_DENIED',
          'The public source is not declared by this DSH task',
        )
      }
      const source = await context.researchBroker.capture(
        submission,
        context.invocation,
        context.signal,
      )
      sendJson(response, 200, { data: source })
      return
    }

    const executeMatch = /^\/v1\/actions\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/execute$/
      .exec(path)
    if (executeMatch?.[1]) {
      requireMethod(request, 'POST')
      if (context.actionsEnabled === false) {
        throw new BridgeRequestError(
          403,
          'PERMISSION_DENIED',
          'Action access is not enabled for this DSH task',
        )
      }
      await readEmptyJsonObject(request)
      const actionId = executeMatch[1]
      if (!context.allowedActionIds.has(actionId)) {
        throw new BridgeRequestError(
          403,
          'PERMISSION_DENIED',
          'The action is not referenced by this DSH task',
        )
      }
      sendJson(response, 200, {
        data: summarizeAction(await context.actionBroker.execute(actionId, context.invocation)),
      })
      return
    }

    throw new BridgeRequestError(404, 'INVALID_INPUT', 'Bridge route not found')
  } catch (error) {
    sendBridgeError(response, error)
  }
}

function requireAuthorization(request: IncomingMessage, expectedTokenDigest: Buffer): void {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')
  const supplied = match?.[1]
  const suppliedDigest = supplied ? digestToken(supplied) : Buffer.alloc(expectedTokenDigest.length)
  if (!supplied || !timingSafeEqual(expectedTokenDigest, suppliedDigest)) {
    throw new BridgeRequestError(401, 'AUTH_REQUIRED', 'A valid Run token is required')
  }
}

function requireJsonRequest(request: IncomingMessage): void {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new BridgeRequestError(415, 'INVALID_INPUT', 'Content-Type must be application/json')
  }
  const declaredLength = Number.parseInt(request.headers['content-length'] ?? '0', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new BridgeRequestError(413, 'INVALID_INPUT', 'Request body is too large')
  }
}

function requireMethod(request: IncomingMessage, expected: string): void {
  if (request.method !== expected) {
    throw new BridgeRequestError(405, 'INVALID_INPUT', `Method must be ${expected}`)
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_REQUEST_BYTES) {
      throw new BridgeRequestError(413, 'INVALID_INPUT', 'Request body is too large')
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new BridgeRequestError(400, 'INVALID_INPUT', 'Request body must be valid JSON')
  }
}

async function readEmptyJsonObject(request: IncomingMessage): Promise<void> {
  const body = await readJsonBody(request)
  if (
    typeof body !== 'object'
    || body === null
    || Array.isArray(body)
    || Object.keys(body).length > 0
  ) {
    throw new BridgeRequestError(400, 'INVALID_INPUT', 'Execute body must be an empty object')
  }
}

function summarizeAction(detail: ActionDetail): Record<string, JsonValue> {
  return {
    actionDigest: detail.action.actionDigest,
    actionId: detail.action.id,
    authorizationStatus: detail.authorization?.status ?? null,
    inputDigest: detail.action.inputDigest,
    operation: detail.action.operation,
    status: detail.action.status,
    target: detail.action.target,
    verificationStatus: detail.verification?.status ?? null,
  }
}

function sendBridgeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  if (error instanceof BridgeRequestError) {
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
        safeToRetry: false,
      },
    })
    return
  }
  if (error instanceof Error && error.name === 'ZodError') {
    sendJson(response, 400, {
      error: {
        code: 'INVALID_INPUT',
        message: 'Bridge request validation failed',
        retryable: false,
        safeToRetry: false,
      },
    })
    return
  }
  const candidate = asErrorRecord(error)
  const candidateCode = typeof candidate?.code === 'string' ? candidate.code : undefined
  const code = candidateCode && isActionErrorCode(candidateCode)
    ? candidateCode
    : 'BRIDGE_FAILURE'
  const status = actionErrorStatus(code)
  const message = code === 'BRIDGE_FAILURE'
    ? 'The action bridge failed'
    : error instanceof Error
      ? error.message
      : 'The action bridge rejected the request'
  sendJson(response, status, {
    error: {
      code,
      message,
      retryable: code === 'OUTCOME_UNKNOWN',
      safeToRetry: false,
    },
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function actionErrorStatus(code: string): number {
  if (code === 'PERMISSION_DENIED') return 403
  if (code === 'INVALID_INPUT') return 400
  if (code === 'DEADLINE_EXCEEDED') return 504
  if (code === 'DEPENDENCY_UNAVAILABLE') return 503
  if (
    code === 'APPROVAL_EXPIRED'
    || code === 'APPROVAL_REQUIRED'
    || code === 'CANCELLED'
    || code === 'CONFLICT'
    || code === 'OUTCOME_UNKNOWN'
  ) return 409
  return 500
}

function isActionErrorCode(code: string): boolean {
  return [
    'APPROVAL_EXPIRED',
    'APPROVAL_REQUIRED',
    'CANCELLED',
    'CONFLICT',
    'DEADLINE_EXCEEDED',
    'DEPENDENCY_UNAVAILABLE',
    'INVALID_INPUT',
    'OUTCOME_UNKNOWN',
    'PERMISSION_DENIED',
    'VERIFICATION_FAILED',
  ].includes(code)
}

function digestToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

function asErrorRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolveListen()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })
}

function closeServer(server: Server): Promise<void> {
  server.closeIdleConnections()
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error)
        return
      }
      resolveClose()
    })
    server.closeAllConnections()
  })
}

class BridgeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BridgeRequestError'
  }
}
