import { describe, expect, it, vi } from 'vitest'
import type { ExecutionInput, TaskExecutor } from '@lumi/assistant-core'
import { createTaskRequest, type Principal } from '@lumi/contracts'
import { SqliteTaskLedger } from '@lumi/task-ledger'
import {
  encodeResearchSourceReference,
  normalizePublicSourceUrl,
  ResearchBriefWorkflow,
  ResearchEvidenceExecutor,
  ResearchSourceService,
  researchSourceUrlsFromContextRefs,
  RESEARCH_WORKFLOW_REFERENCE,
  type ResearchSourceRecord,
} from '../src/index.ts'

const principal: Principal = {
  authStrength: 'local_process',
  id: 'researcher',
  kind: 'owner',
  ownerId: 'owner-one',
}

describe('research brief workflow', () => {
  it('normalizes explicit sources into bounded context references', async () => {
    const submit = vi.fn(async request => ({
      ...request,
      capabilityId: null,
      dshSessionId: null,
      error: null,
      result: null,
      state: 'queued' as const,
      updatedAt: request.createdAt,
    }))
    const workflow = new ResearchBriefWorkflow({ submit })

    await workflow.submit(principal, {
      id: 'research-one',
      question: 'Compare the two proposals',
      schemaVersion: 'lumi.research-brief/v1',
      sources: ['https://example.com', 'https://example.org/report'],
    })

    expect(submit).toHaveBeenCalledOnce()
    const request = submit.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      actorId: 'researcher',
      channel: 'research-brief',
      content: 'Compare the two proposals',
      id: 'research-one',
    })
    expect(request?.contextRefs[0]).toBe(RESEARCH_WORKFLOW_REFERENCE)
    expect(researchSourceUrlsFromContextRefs(request?.contextRefs ?? [])).toEqual([
      'https://example.com/',
      'https://example.org/report',
    ])
  })

  it.each([
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com:444',
    'https://example.com/page#private',
    'https://127.0.0.1',
    'not a url',
  ])('rejects unsupported source URL %s', (url) => {
    expect(() => normalizePublicSourceUrl(url)).toThrow()
  })

  it('does not treat malformed source references as authority', () => {
    const valid = encodeResearchSourceReference('https://example.com/')
    expect(researchSourceUrlsFromContextRefs([
      valid,
      `${valid}=`,
      'lumi-public-source:not-base64!',
      'other',
    ])).toEqual(['https://example.com/'])
  })
})

describe('research source capture and verification', () => {
  it('records metadata while keeping source text out of events and audit', async () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const task = createTaskRequest({
      actorId: principal.id,
      channel: 'research-brief',
      content: 'Summarize the source',
      id: 'research-capture',
    })
    ledger.createTask(task)
    const save = vi.fn(async (
      record: Omit<ResearchSourceRecord, 'sourceRef'>,
    ) => ({
      record: {
        ...record,
        sourceRef: 'file:///tmp/source.json',
      },
      reused: false,
    }))
    const service = new ResearchSourceService({
      fetcher: {
        fetch: async () => ({
          finalUrl: 'https://example.com/report',
          mediaType: 'text/html',
          requestedUrl: 'https://example.com/report',
          text: 'Private source body',
          title: 'Report',
          truncated: false,
        }),
      },
      ledger,
      now: () => '2026-09-25T00:00:00.000Z',
      store: { save },
    })

    const source = await service.capture(principal, {
      schemaVersion: 'lumi.research-fetch/v1',
      url: 'https://example.com/report',
    }, {
      sourceTaskId: task.id,
    }, new AbortController().signal)

    expect(source.id).toMatch(/^source_[a-f0-9]{24}$/)
    expect(save).toHaveBeenCalledOnce()
    const serializedMetadata = JSON.stringify({
      audit: ledger.listAudit(task.id),
      events: ledger.listEvents(task.id),
    })
    expect(serializedMetadata).toContain(source.id)
    expect(serializedMetadata).not.toContain('Private source body')
    ledger.close()
  })

  it('passes only when every declared source is captured and cited', async () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const url = 'https://example.com/report'
    const task = createTaskRequest({
      actorId: principal.id,
      channel: 'research-brief',
      content: 'Summarize the source',
      contextRefs: [
        RESEARCH_WORKFLOW_REFERENCE,
        encodeResearchSourceReference(url),
      ],
      id: 'research-verified',
    })
    ledger.createTask(task)
    const sourceId = 'source_0123456789abcdef01234567'
    const delegate: TaskExecutor = {
      async execute() {
        ledger.appendEvent(task.id, 'research.source_captured', {
          requestedUrl: url,
          sourceId,
        })
        return { output: `Supported finding [${sourceId}]` }
      },
    }
    const executor = new ResearchEvidenceExecutor(delegate, ledger)

    await expect(executor.execute(executionInput(task))).resolves.toEqual({
      output: `Supported finding [${sourceId}]`,
    })
    expect(ledger.listEvents(task.id)).toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({ status: 'passed' }),
      type: 'verification.completed',
    }))
    ledger.close()
  })

  it('fails when a captured source is absent from the final result', async () => {
    const ledger = new SqliteTaskLedger({ filename: ':memory:' })
    const url = 'https://example.com/report'
    const task = createTaskRequest({
      actorId: principal.id,
      channel: 'research-brief',
      content: 'Summarize the source',
      contextRefs: [
        RESEARCH_WORKFLOW_REFERENCE,
        encodeResearchSourceReference(url),
      ],
      id: 'research-uncited',
    })
    ledger.createTask(task)
    const delegate: TaskExecutor = {
      async execute() {
        ledger.appendEvent(task.id, 'research.source_captured', {
          requestedUrl: url,
          sourceId: 'source_0123456789abcdef01234567',
        })
        return { output: 'An unsupported uncited finding.' }
      },
    }
    const executor = new ResearchEvidenceExecutor(delegate, ledger)

    await expect(executor.execute(executionInput(task)))
      .rejects.toThrow('did not cite 1 captured source')
    expect(ledger.listAudit(task.id)).toContainEqual(expect.objectContaining({
      action: 'research.verify',
      outcome: 'failed',
    }))
    ledger.close()
  })
})

function executionInput(task: ReturnType<typeof createTaskRequest>): ExecutionInput {
  return {
    capability: {
      description: 'Research',
      id: 'research-agent',
      kind: 'agent',
      operations: ['fetch_declared_public_source'],
      riskLevel: 'read',
    },
    emit: () => undefined,
    signal: new AbortController().signal,
    task,
  }
}
