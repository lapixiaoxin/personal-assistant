import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { ActionServiceError } from '@lumi/action-runtime'
import {
  ActionProposalSubmissionSchema,
  createTaskRequest,
  TaskListQuerySchema,
  TaskSubmissionSchema,
  type ActionErrorCode,
  type Principal,
  type TaskRecord,
} from '@lumi/contracts'
import { IdentityError } from '@lumi/identity'
import {
  ResearchBriefSubmissionSchema,
  ResearchWorkflowError,
} from '@lumi/research-workflow'
import {
  MeetingBriefSubmissionSchema,
  MeetingWorkflowError,
} from '@lumi/meeting-workflow'
import {
  MemoryNotFoundError,
  MemoryStateConflictError,
  PersonalMemoryCorrectionSchema,
  PersonalMemoryCreateSchema,
  PersonalMemoryListQuerySchema,
} from '@lumi/personal-memory'
import { createAssistantRuntime, type AssistantRuntime } from '@lumi/runtime'
import {
  ActionAuthorizationError,
  ActionConflictError,
  ActionNotFoundError,
  ActionStateConflictError,
} from '@lumi/task-ledger'
import { z, ZodError } from 'zod'

const TaskParamsSchema = z.object({
  taskId: z.string().trim().min(1).max(128),
})
const AssetParamsSchema = z.object({
  filename: z.string().regex(/^[A-Za-z0-9._-]+$/),
})
const DecisionBodySchema = z.object({
  actorId: z.string().trim().min(1).max(128).optional(),
})
const ActionParamsSchema = z.object({
  actionId: z.string().trim().min(1).max(128),
})
const ActionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
const MemoryParamsSchema = z.object({
  memoryId: z.string().trim().min(1).max(128),
})

export interface GatewayOptions {
  logger?: boolean
  runtime?: AssistantRuntime
  workbenchDir?: false | string
}

export function buildGateway(options: GatewayOptions = {}): FastifyInstance {
  const runtime = options.runtime ?? createAssistantRuntime()
  const ownsRuntime = options.runtime === undefined
  const app = Fastify({ logger: options.logger ?? false })

  app.get('/health', async () => ({
    executor: runtime.executorKind,
    status: 'ok',
  }))

  app.get('/v1/capabilities', async (request) => {
    authenticate(runtime, request)
    return { data: runtime.capabilities.list() }
  })

  app.post('/v1/tasks', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const submission = TaskSubmissionSchema.parse(request.body)
    if (submission.actorId) assertClaimedActor(principal, submission.actorId)
    const task = await runtime.core.submit(createTaskRequest({
      ...submission,
      actorId: principal.id,
    }))
    reply.code(task.state === 'waiting_approval' ? 202 : 201)
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
        task,
      },
    }
  })

  app.get('/v1/tasks', async (request) => {
    const principal = authenticate(runtime, request)
    const query = TaskListQuerySchema.parse(request.query)
    if (query.actorId) assertClaimedActor(principal, query.actorId)
    return {
      data: runtime.ledger.listTasks({
        ...query,
        actorId: principal.id,
        limit: 200,
      }).filter(isVisibleV1Task).slice(0, query.limit),
    }
  })

  app.get('/v1/tasks/:taskId', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const task = runtime.core.getTask(taskId)
    if (!task || !isVisibleV1Task(task)) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    assertOwnedTask(principal, task)
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(taskId) ?? null,
        task,
      },
    }
  })

  app.get('/v1/tasks/:taskId/events', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const task = runtime.core.getTask(taskId)
    if (!task || !isVisibleV1Task(task)) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    assertOwnedTask(principal, task)
    return { data: runtime.ledger.listEvents(taskId) }
  })

  app.get('/v1/tasks/:taskId/audit', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const task = runtime.core.getTask(taskId)
    if (!task || !isVisibleV1Task(task)) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    assertOwnedTask(principal, task)
    return { data: runtime.ledger.listAudit(taskId) }
  })

  app.post('/v1/tasks/:taskId/approve', async (request) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    if (actorId) assertClaimedActor(principal, actorId)
    assertOwnedTask(principal, requireV1Task(runtime, taskId))
    return { data: await runtime.core.approve(taskId, principal.id) }
  })

  app.post('/v1/tasks/:taskId/reject', async (request) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    if (actorId) assertClaimedActor(principal, actorId)
    assertOwnedTask(principal, requireV1Task(runtime, taskId))
    return { data: runtime.core.reject(taskId, principal.id) }
  })

  app.post('/v1/tasks/:taskId/cancel', async (request) => {
    const principal = authenticate(runtime, request)
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    if (actorId) assertClaimedActor(principal, actorId)
    assertOwnedTask(principal, requireV1Task(runtime, taskId))
    return { data: runtime.core.cancel(taskId, principal.id) }
  })

  app.post('/v2/actions', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const proposal = ActionProposalSubmissionSchema.parse(request.body)
    const detail = runtime.actions.prepare(principal, proposal)
    reply.code(202)
    return { data: detail }
  })

  app.get('/v2/actions', async (request) => {
    const principal = authenticate(runtime, request)
    const query = ActionListQuerySchema.parse(request.query)
    return { data: runtime.actions.list(principal, query.limit) }
  })

  app.get('/v2/actions/:actionId', async (request) => {
    const principal = authenticate(runtime, request)
    const { actionId } = ActionParamsSchema.parse(request.params)
    return { data: runtime.actions.get(principal, actionId) }
  })

  app.post('/v2/actions/:actionId/authorize', async (request) => {
    const principal = authenticate(runtime, request)
    const { actionId } = ActionParamsSchema.parse(request.params)
    return { data: runtime.actions.authorize(principal, actionId) }
  })

  app.post('/v2/actions/:actionId/execute', async (request) => {
    const principal = authenticate(runtime, request)
    const { actionId } = ActionParamsSchema.parse(request.params)
    return { data: await runtime.actions.execute(principal, actionId) }
  })

  app.post('/v2/actions/:actionId/reconcile', async (request) => {
    const principal = authenticate(runtime, request)
    const { actionId } = ActionParamsSchema.parse(request.params)
    return { data: await runtime.actions.reconcile(principal, actionId) }
  })

  app.post('/v2/actions/:actionId/cancel', async (request) => {
    const principal = authenticate(runtime, request)
    const { actionId } = ActionParamsSchema.parse(request.params)
    return { data: runtime.actions.cancel(principal, actionId) }
  })

  app.post('/v2/memories', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const input = PersonalMemoryCreateSchema.parse(request.body)
    reply.code(201)
    return { data: runtime.memories.create(principal, input) }
  })

  app.get('/v2/memories', async (request) => {
    const principal = authenticate(runtime, request)
    const query = PersonalMemoryListQuerySchema.parse(request.query)
    return { data: runtime.memories.list(principal, query) }
  })

  app.get('/v2/memories/:memoryId', async (request) => {
    const principal = authenticate(runtime, request)
    const { memoryId } = MemoryParamsSchema.parse(request.params)
    return { data: runtime.memories.get(principal, memoryId) }
  })

  app.post('/v2/memories/:memoryId/confirm', async (request) => {
    const principal = authenticate(runtime, request)
    const { memoryId } = MemoryParamsSchema.parse(request.params)
    return { data: runtime.memories.confirm(principal, memoryId) }
  })

  app.post('/v2/memories/:memoryId/correct', async (request) => {
    const principal = authenticate(runtime, request)
    const { memoryId } = MemoryParamsSchema.parse(request.params)
    const correction = PersonalMemoryCorrectionSchema.parse(request.body)
    return { data: runtime.memories.correct(principal, memoryId, correction) }
  })

  app.post('/v2/memories/:memoryId/retract', async (request) => {
    const principal = authenticate(runtime, request)
    const { memoryId } = MemoryParamsSchema.parse(request.params)
    return { data: runtime.memories.retract(principal, memoryId) }
  })

  app.delete('/v2/memories/:memoryId', async (request) => {
    const principal = authenticate(runtime, request)
    const { memoryId } = MemoryParamsSchema.parse(request.params)
    return { data: runtime.memories.forget(principal, memoryId) }
  })

  app.post('/v2/workflows/research-brief', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const submission = ResearchBriefSubmissionSchema.parse(request.body)
    const task = await runtime.research.submit(principal, submission)
    reply.code(task.state === 'waiting_approval' ? 202 : 201)
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
        task,
      },
    }
  })

  app.post('/v2/workflows/meeting-brief', async (request, reply) => {
    const principal = authenticate(runtime, request)
    const submission = MeetingBriefSubmissionSchema.parse(request.body)
    const task = await runtime.meeting.submit(principal, submission)
    reply.code(task.state === 'waiting_approval' ? 202 : 201)
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
        task,
      },
    }
  })

  if (options.workbenchDir) {
    const root = resolve(options.workbenchDir)
    if (!existsSync(root)) {
      throw new Error(`Workbench build not found: ${root}`)
    }
    app.get('/', async (_request, reply) => {
      const content = await readFile(resolve(root, 'index.html'))
      return reply.type('text/html; charset=utf-8').send(content)
    })
    app.get('/assets/:filename', async (request, reply) => {
      const { filename } = AssetParamsSchema.parse(request.params)
      const content = await readFile(resolve(root, 'assets', filename))
      reply.header('cache-control', 'public, max-age=31536000, immutable')
      return reply.type(assetContentType(filename)).send(content)
    })
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request validation failed',
          retryable: false,
          safeToRetry: false,
          issues: error.issues,
        },
      })
      return
    }
    if (error instanceof IdentityError) {
      reply.code(error.code === 'AUTH_REQUIRED' ? 401 : 403).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof ActionServiceError) {
      reply.code(actionErrorStatus(error.code)).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          safeToRetry: error.safeToRetry,
        },
      })
      return
    }
    if (error instanceof ResearchWorkflowError) {
      reply.code(error.code === 'PERMISSION_DENIED' ? 403 : 422).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.code === 'DEPENDENCY_UNAVAILABLE',
          safeToRetry: error.code === 'DEPENDENCY_UNAVAILABLE',
        },
      })
      return
    }
    if (error instanceof MeetingWorkflowError) {
      reply.code(error.code === 'PERMISSION_DENIED' ? 403 : 422).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof MemoryNotFoundError) {
      reply.code(404).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof MemoryStateConflictError) {
      reply.code(409).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof ActionAuthorizationError) {
      reply.code(error.code === 'PERMISSION_DENIED' ? 403 : 409).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.code === 'APPROVAL_EXPIRED',
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof ActionNotFoundError) {
      reply.code(404).send({
        error: {
          code: 'INVALID_INPUT',
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error instanceof ActionConflictError || error instanceof ActionStateConflictError) {
      reply.code(409).send({
        error: {
          code: 'CONFLICT',
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error.name === 'TaskIdConflictError' || error.name === 'TaskStateConflictError') {
      reply.code(409).send({
        error: {
          code: 'TASK_CONFLICT',
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    if (error.message.startsWith('Task not found:')) {
      reply.code(404).send({
        error: {
          code: 'TASK_NOT_FOUND',
          message: error.message,
          retryable: false,
          safeToRetry: false,
        },
      })
      return
    }
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed',
        retryable: false,
        safeToRetry: false,
      },
    })
  })

  if (ownsRuntime) {
    app.addHook('onClose', async () => runtime.close())
  }
  return app
}

function assetContentType(filename: string): string {
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filename.endsWith('.map')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function authenticate(runtime: AssistantRuntime, request: FastifyRequest): Principal {
  return runtime.identity.authenticateBearer(request.headers.authorization)
}

function assertClaimedActor(principal: Principal, actorId: string): void {
  if (actorId !== principal.id) {
    throw new IdentityError(
      'PERMISSION_DENIED',
      'The claimed actor does not match the authenticated principal',
    )
  }
}

function assertOwnedTask(principal: Principal, task: TaskRecord): void {
  if (task.actorId !== principal.id) {
    throw new IdentityError('PERMISSION_DENIED', 'The task belongs to another principal')
  }
}

function isVisibleV1Task(task: TaskRecord): boolean {
  return task.channel !== 'action-runtime'
}

function requireV1Task(runtime: AssistantRuntime, taskId: string): TaskRecord {
  const task = runtime.core.requireTask(taskId)
  if (!isVisibleV1Task(task)) throw new Error(`Task not found: ${taskId}`)
  return task
}

function actionErrorStatus(code: ActionErrorCode): number {
  if (code === 'AUTH_REQUIRED') return 401
  if (code === 'PERMISSION_DENIED') return 403
  if (code === 'INVALID_INPUT') return 400
  if (code === 'VERIFICATION_FAILED') return 422
  return 409
}
