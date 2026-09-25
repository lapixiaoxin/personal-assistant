import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskExecutor } from '@lumi/assistant-core'
import { createTaskRequest } from '@lumi/contracts'
import {
  MEETING_BRIEF_END_MARKER,
  MEETING_BRIEF_SECTIONS,
  MEETING_BRIEF_START_MARKER,
} from '@lumi/meeting-workflow'
import { createAssistantRuntime, type AssistantRuntime } from '@lumi/runtime'
import { researchSourceUrlsFromContextRefs } from '@lumi/research-workflow'
import { SqliteTaskLedger } from '@lumi/task-ledger'
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

  it('exposes the owner-scoped personal memory lifecycle', async () => {
    const runtime = testRuntime()
    const app = buildGateway({ runtime })
    const created = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        allowedPurposes: ['general_assistance', 'meeting'],
        classification: 'personal',
        content: 'Prefer concise meeting briefs',
        kind: 'preference',
        scope: 'global',
        status: 'candidate',
      },
      url: '/v2/memories',
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({
      ownerId: 'local-owner',
      revision: 1,
      status: 'candidate',
    })
    const memoryId = created.json().data.id as string

    const listed = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v2/memories?status=candidate',
    })
    expect(listed.json().data).toHaveLength(1)

    const confirmed = await app.inject({
      headers: authenticatedHeaders(),
      method: 'POST',
      url: `/v2/memories/${memoryId}/confirm`,
    })
    expect(confirmed.json().data).toMatchObject({ revision: 2, status: 'confirmed' })

    const corrected = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        allowedPurposes: ['meeting'],
        content: 'Prefer decision-first meeting briefs',
        scope: 'meeting',
      },
      url: `/v2/memories/${memoryId}/correct`,
    })
    expect(corrected.json().data).toMatchObject({
      allowedPurposes: ['meeting'],
      content: 'Prefer decision-first meeting briefs',
      revision: 3,
      scope: 'meeting',
    })

    const retracted = await app.inject({
      headers: authenticatedHeaders(),
      method: 'POST',
      url: `/v2/memories/${memoryId}/retract`,
    })
    expect(retracted.json().data).toMatchObject({ revision: 4, status: 'retracted' })

    const forgotten = await app.inject({
      headers: authenticatedHeaders(),
      method: 'DELETE',
      url: `/v2/memories/${memoryId}`,
    })
    expect(forgotten.json().data).toMatchObject({
      id: memoryId,
      lastRevision: 4,
    })
    expect(JSON.stringify(forgotten.json())).not.toContain('decision-first')

    const missing = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: `/v2/memories/${memoryId}`,
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('MEMORY_NOT_FOUND')
    await app.close()
  })

  it('does not expose another owner memory through the authenticated API', async () => {
    const runtime = testRuntime()
    const foreign = runtime.memories.create({
      authStrength: 'local_process',
      id: 'foreign-user',
      kind: 'owner',
      ownerId: 'foreign-owner',
    }, {
      content: 'Foreign owner memory',
    })
    const app = buildGateway({ runtime })

    const response = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: `/v2/memories/${foreign.id}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('MEMORY_NOT_FOUND')
    await app.close()
  })

  it('lists and retries an interrupted task through the authenticated recovery API', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lumi-gateway-recovery-'))
    temporaryDirectories.push(directory)
    const dbPath = join(directory, 'assistant.db')
    const seed = new SqliteTaskLedger({ filename: dbPath })
    const request = createTaskRequest({
      actorId: 'user-1',
      channel: 'meeting-brief',
      content: 'Prepare the interrupted meeting',
      id: 'task-http-recovery',
    })
    seed.createTask(request)
    seed.transitionTask(request.id, ['queued'], 'running', {
      capabilityId: 'meeting-agent',
    })
    seed.appendEvent(request.id, 'execution.started', {
      capabilityId: 'meeting-agent',
    })
    seed.close()
    const runtime = createAssistantRuntime({
      dbPath,
      executor: { execute: async () => ({ output: 'recovered through HTTP' }) },
      httpToken: token,
      principalId: 'user-1',
    })
    openRuntimes.push(runtime)
    const app = buildGateway({ runtime })

    const listed = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: '/v2/recoveries?status=pending',
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().data).toHaveLength(1)
    const recoveryId = listed.json().data[0].id as string

    const retried = await app.inject({
      headers: authenticatedHeaders(),
      method: 'POST',
      url: `/v2/recoveries/${recoveryId}/retry`,
    })
    expect(retried.statusCode).toBe(200)
    expect(retried.json().data).toMatchObject({
      recovery: { resolution: 'retried', status: 'resolved' },
      task: { result: 'recovered through HTTP', state: 'completed' },
    })
    expect(retried.json().data.task.id).not.toBe(request.id)

    const foreignTask = createTaskRequest({
      actorId: 'foreign-user',
      channel: 'web',
      content: 'Foreign interrupted task',
      id: 'task-foreign-recovery',
    })
    runtime.ledger.createTask(foreignTask)
    runtime.ledger.transitionTask(foreignTask.id, ['queued'], 'running', {
      capabilityId: 'personal-assistant',
    })
    const foreignRecovery = runtime.ledger.recordTaskRecovery({
      disposition: 'retry_available',
      ownerId: 'foreign-owner',
      principalId: 'foreign-user',
      reasonCode: 'HOST_RESTART_SAFE_TO_RETRY',
      safeToRetry: true,
      taskId: foreignTask.id,
    })
    const hidden = await app.inject({
      headers: authenticatedHeaders(),
      method: 'GET',
      url: `/v2/recoveries/${foreignRecovery.id}`,
    })
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json().error.code).toBe('RECOVERY_NOT_FOUND')
    await app.close()
  })

  it('submits a structured research brief with server-owned workflow refs', async () => {
    const state: { runtime?: AssistantRuntime } = {}
    const executor: TaskExecutor = {
      execute: async ({ task }) => {
        const sources = researchSourceUrlsFromContextRefs(task.contextRefs)
        const sourceIds = sources.map((_source, index) =>
          `source_${String(index + 1).padStart(24, '0')}`,
        )
        sources.forEach((source, index) => {
          state.runtime?.ledger.appendEvent(task.id, 'research.source_captured', {
            requestedUrl: source,
            sourceId: sourceIds[index] ?? '',
          })
        })
        return {
          output: `Research result ${sourceIds.map(id => `[${id}]`).join(' ')}`,
          sessionId: `session-${task.id}`,
        }
      },
    }
    const runtime = createAssistantRuntime({
      dbPath: ':memory:',
      executor,
      httpToken: token,
      principalId: 'user-1',
    })
    state.runtime = runtime
    openRuntimes.push(runtime)
    const app = buildGateway({ runtime })
    const submitted = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        id: 'research-http',
        question: 'Compare the declared sources',
        schemaVersion: 'lumi.research-brief/v1',
        sources: ['https://example.com', 'https://example.org/report'],
      },
      url: '/v2/workflows/research-brief',
    })

    expect(submitted.statusCode).toBe(201)
    expect(submitted.json().data.task).toMatchObject({
      capabilityId: 'research-agent',
      channel: 'research-brief',
      id: 'research-http',
      state: 'completed',
    })
    expect(submitted.json().data.task.contextRefs).toHaveLength(3)
    expect(runtime.ledger.listEvents('research-http')).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ status: 'passed', sourceCount: 2 }),
        type: 'verification.completed',
      }),
    )

    const invalid = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        question: 'Read a private service',
        sources: ['http://127.0.0.1/private'],
      },
      url: '/v2/workflows/research-brief',
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('INVALID_REQUEST')
    await app.close()
  })

  it('submits and verifies a structured meeting brief', async () => {
    const runtime = createAssistantRuntime({
      dbPath: ':memory:',
      executor: {
        execute: async ({ task }) => ({
          output: meetingOutput(),
          sessionId: `session-${task.id}`,
        }),
      },
      httpToken: token,
      principalId: 'user-1',
    })
    openRuntimes.push(runtime)
    const app = buildGateway({ runtime })
    const submitted = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        agenda: ['Review options', 'Choose an owner'],
        background: 'The delivery date is fixed.',
        id: 'meeting-http',
        objective: 'Select the implementation plan.',
        participants: ['Product lead', 'Engineering lead'],
        schemaVersion: 'lumi.meeting-brief/v1',
        topic: 'Implementation review',
      },
      url: '/v2/workflows/meeting-brief',
    })

    expect(submitted.statusCode).toBe(201)
    expect(submitted.json().data.task).toMatchObject({
      capabilityId: 'meeting-agent',
      channel: 'meeting-brief',
      id: 'meeting-http',
      state: 'completed',
    })
    expect(submitted.json().data.task.contextRefs).toEqual([
      'lumi-workflow:meeting-brief/v1',
    ])
    expect(runtime.ledger.listEvents('meeting-http')).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: 'passed',
          workflow: 'meeting-brief',
        }),
        type: 'verification.completed',
      }),
    )

    const invalid = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        agenda: [],
        objective: 'Select a plan',
        participants: ['Product lead'],
        topic: 'Implementation review',
      },
      url: '/v2/workflows/meeting-brief',
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('INVALID_REQUEST')

    const forged = await app.inject({
      headers: authenticatedHeaders(true),
      method: 'POST',
      payload: {
        content: 'Bypass the structured meeting input',
        contextRefs: ['lumi-workflow:meeting-brief/v1'],
      },
      url: '/v1/tasks',
    })
    expect(forged.statusCode).toBe(400)
    expect(forged.json().error.code).toBe('INVALID_REQUEST')
    await app.close()
  })
})

function authenticatedHeaders(json = false): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

function meetingOutput(): string {
  return [
    MEETING_BRIEF_START_MARKER,
    ...MEETING_BRIEF_SECTIONS.flatMap(section => [section, 'Complete section body.']),
    MEETING_BRIEF_END_MARKER,
  ].join('\n')
}
