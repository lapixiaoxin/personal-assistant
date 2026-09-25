import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskExecutor } from '@lumi/assistant-core'
import { createAssistantRuntime, type AssistantRuntime } from '@lumi/runtime'
import { buildGateway } from '../src/server.ts'

const openRuntimes: AssistantRuntime[] = []
const temporaryDirectories: string[] = []
const token = '0123456789abcdef0123456789abcdef'

afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function testRuntime(): AssistantRuntime {
  const executor: TaskExecutor = {
    execute: async ({ capability, task }) => ({
      output: `${capability.id}:${task.content}`,
      sessionId: `session-${task.id}`,
    }),
  }
  const artifactRoot = mkdtempSync(join(tmpdir(), 'lumi-gateway-artifacts-'))
  temporaryDirectories.push(artifactRoot)
  const runtime = createAssistantRuntime({
    artifactRoot,
    dbPath: ':memory:',
    executor,
    httpToken: token,
    principalId: 'user-1',
  })
  openRuntimes.push(runtime)
  return runtime
}

describe('gateway', () => {
  it('uses the same task contract for submission, lookup, events, and audit', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.json()).toEqual({ executor: 'custom', status: 'ok' })

    const submitted = await app.inject({
      method: 'POST',
      payload: {
        actorId: 'user-1',
        channel: 'http',
        content: 'Implement a TypeScript endpoint',
        id: 'task-http',
      },
      headers: authenticatedHeaders(true),
      url: '/v1/tasks',
    })

    expect(submitted.statusCode).toBe(201)
    expect(submitted.json().data.task).toMatchObject({
      capabilityId: 'coding-agent',
      id: 'task-http',
      state: 'completed',
    })

    const fetched = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v1/tasks/task-http',
    })
    expect(fetched.json().data.task.result).toBe('coding-agent:Implement a TypeScript endpoint')

    const events = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v1/tasks/task-http/events',
    })
    expect(events.json().data.map((event: { type: string }) => event.type))
      .toContain('execution.completed')

    const audit = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v1/tasks/task-http/audit',
    })
    expect(audit.json().data.map((record: { action: string }) => record.action))
      .toContain('execution.complete')
    await app.close()
  })

  it('requires and records explicit approval for external actions', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const submitted = await app.inject({
      method: 'POST',
      payload: {
        actorId: 'user-1',
        content: 'Send this message to the team',
        id: 'task-http-approval',
      },
      headers: authenticatedHeaders(true),
      url: '/v1/tasks',
    })
    expect(submitted.statusCode).toBe(202)
    expect(submitted.json().data.task.state).toBe('waiting_approval')

    const approved = await app.inject({
      method: 'POST',
      payload: { actorId: 'user-1' },
      headers: authenticatedHeaders(true),
      url: '/v1/tasks/task-http-approval/approve',
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().data.state).toBe('completed')
    await app.close()
  })

  it('returns structured validation and not-found errors', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const invalid = await app.inject({
      method: 'POST',
      payload: { actorId: '', content: '' },
      headers: authenticatedHeaders(true),
      url: '/v1/tasks',
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('INVALID_REQUEST')

    const missing = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v1/tasks/missing',
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('TASK_NOT_FOUND')
    await app.close()
  })

  it('serves the built workbench when a static directory is configured', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-workbench-'))
    temporaryDirectories.push(directory)
    mkdirSync(join(directory, 'assets'))
    writeFileSync(join(directory, 'index.html'), '<main>lumi workbench</main>')
    writeFileSync(join(directory, 'assets', 'app.js'), 'globalThis.lumi = true')
    const app = buildGateway({
      runtime: testRuntime(),
      workbenchDir: directory,
    })

    const index = await app.inject({ method: 'GET', url: '/' })
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' })

    expect(index.statusCode).toBe(200)
    expect(index.body).toContain('lumi workbench')
    expect(asset.statusCode).toBe(200)
    expect(asset.body).toContain('globalThis.lumi')
    await app.close()
  })

  it('rejects unauthenticated requests and actor impersonation', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const unauthenticated = await app.inject({ method: 'GET', url: '/v1/tasks' })
    expect(unauthenticated.statusCode).toBe(401)
    expect(unauthenticated.json().error).toMatchObject({
      code: 'AUTH_REQUIRED',
      safeToRetry: false,
    })

    const impersonated = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        actorId: 'another-user',
        content: 'Read private tasks',
      },
      url: '/v1/tasks',
    })
    expect(impersonated.statusCode).toBe(403)
    expect(impersonated.json().error.code).toBe('PERMISSION_DENIED')
    await app.close()
  })

  it('exposes the authenticated v2 action lifecycle', async () => {
    const app = buildGateway({ runtime: testRuntime() })
    const prepared = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        content: 'gateway artifact',
        idempotencyKey: 'gateway-artifact',
        operation: 'artifact.write',
        schemaVersion: 'lumi.action-proposal/v1',
        target: { artifactId: 'gateway-artifact' },
      },
      url: '/v2/actions',
    })
    expect(prepared.statusCode).toBe(202)
    const actionId = prepared.json().data.action.id as string
    const v1Tasks = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v1/tasks',
    })
    expect(v1Tasks.json().data).toEqual([])

    const authorized = await app.inject({
      headers: authenticatedHeaders(),
      method: 'POST',
      url: `/v2/actions/${actionId}/authorize`,
    })
    expect(authorized.json().data.authorization.status).toBe('active')

    const executed = await app.inject({
      headers: authenticatedHeaders(),
      method: 'POST',
      url: `/v2/actions/${actionId}/execute`,
    })
    expect(executed.json().data).toMatchObject({
      action: { status: 'succeeded' },
      task: { state: 'completed' },
      verification: { status: 'passed' },
    })
    await app.close()
  })
})

function authenticatedHeaders(json = false): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}
