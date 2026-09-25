import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { createTaskRequest, TaskListQuerySchema, TaskSubmissionSchema } from '@lumi/contracts'
import { createAssistantRuntime, type AssistantRuntime } from '@lumi/runtime'
import { z, ZodError } from 'zod'

const TaskParamsSchema = z.object({
  taskId: z.string().trim().min(1).max(128),
})
const AssetParamsSchema = z.object({
  filename: z.string().regex(/^[A-Za-z0-9._-]+$/),
})
const DecisionBodySchema = z.object({
  actorId: z.string().trim().min(1).max(128),
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

  app.get('/v1/capabilities', async () => ({
    data: runtime.capabilities.list(),
  }))

  app.post('/v1/tasks', async (request, reply) => {
    const submission = TaskSubmissionSchema.parse(request.body)
    const task = await runtime.core.submit(createTaskRequest(submission))
    reply.code(task.state === 'waiting_approval' ? 202 : 201)
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
        task,
      },
    }
  })

  app.get('/v1/tasks', async (request) => {
    const query = TaskListQuerySchema.parse(request.query)
    return { data: runtime.ledger.listTasks(query) }
  })

  app.get('/v1/tasks/:taskId', async (request, reply) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    const task = runtime.core.getTask(taskId)
    if (!task) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    return {
      data: {
        approval: runtime.ledger.getApprovalForTask(taskId) ?? null,
        task,
      },
    }
  })

  app.get('/v1/tasks/:taskId/events', async (request, reply) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    if (!runtime.core.getTask(taskId)) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    return { data: runtime.ledger.listEvents(taskId) }
  })

  app.get('/v1/tasks/:taskId/audit', async (request, reply) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    if (!runtime.core.getTask(taskId)) {
      reply.code(404)
      return { error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${taskId}` } }
    }
    return { data: runtime.ledger.listAudit(taskId) }
  })

  app.post('/v1/tasks/:taskId/approve', async (request) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    return { data: await runtime.core.approve(taskId, actorId) }
  })

  app.post('/v1/tasks/:taskId/reject', async (request) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    return { data: runtime.core.reject(taskId, actorId) }
  })

  app.post('/v1/tasks/:taskId/cancel', async (request) => {
    const { taskId } = TaskParamsSchema.parse(request.params)
    const { actorId } = DecisionBodySchema.parse(request.body)
    return { data: runtime.core.cancel(taskId, actorId) }
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
          issues: error.issues,
        },
      })
      return
    }
    if (error.name === 'TaskIdConflictError' || error.name === 'TaskStateConflictError') {
      reply.code(409).send({
        error: { code: 'TASK_CONFLICT', message: error.message },
      })
      return
    }
    if (error.message.startsWith('Task not found:')) {
      reply.code(404).send({
        error: { code: 'TASK_NOT_FOUND', message: error.message },
      })
      return
    }
    reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: error.message },
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
