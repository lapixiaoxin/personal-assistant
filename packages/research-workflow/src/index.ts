import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type {
  ExecutionInput,
  ExecutionResult,
  TaskExecutor,
} from '@lumi/assistant-core'
import {
  createTaskRequest,
  type JsonValue,
  type Principal,
  type TaskRecord,
  type TaskRequest,
} from '@lumi/contracts'
import type { TaskLedger } from '@lumi/task-ledger'
import { z } from 'zod'

export const RESEARCH_WORKFLOW_REFERENCE = 'lumi-workflow:research-brief/v1'
const SOURCE_REFERENCE_PREFIX = 'lumi-public-source:'
const MAX_SOURCE_URL_LENGTH = 2_048
const MAX_SOURCE_TEXT_LENGTH = 50_000

const IdentifierSchema = z.string().trim().min(1).max(128)
const TimestampSchema = z.iso.datetime({ offset: true })
const Sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const CanonicalPublicSourceUrlSchema = z.string().transform((value, context) => {
  try {
    return normalizePublicSourceUrl(value)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid public source URL',
    })
    return z.NEVER
  }
})

export const ResearchBriefSubmissionSchema = z.object({
  id: IdentifierSchema.optional(),
  question: z.string().trim().min(1).max(20_000),
  schemaVersion: z.literal('lumi.research-brief/v1').default('lumi.research-brief/v1'),
  sources: z.array(CanonicalPublicSourceUrlSchema).min(1).max(8),
}).superRefine((value, context) => {
  if (new Set(value.sources).size !== value.sources.length) {
    context.addIssue({
      code: 'custom',
      message: 'Research sources must be unique after URL normalization',
      path: ['sources'],
    })
  }
})
export type ResearchBriefSubmission = z.input<typeof ResearchBriefSubmissionSchema>
export type ResearchBrief = z.output<typeof ResearchBriefSubmissionSchema>

export const ResearchFetchSubmissionSchema = z.object({
  schemaVersion: z.literal('lumi.research-fetch/v1'),
  url: CanonicalPublicSourceUrlSchema,
})
export type ResearchFetchSubmission = z.input<typeof ResearchFetchSubmissionSchema>

export const ResearchSourceRecordSchema = z.object({
  contentDigest: Sha256DigestSchema,
  fetchedAt: TimestampSchema,
  finalUrl: CanonicalPublicSourceUrlSchema,
  id: z.string().regex(/^source_[a-f0-9]{24}$/),
  mediaType: z.enum(['application/xhtml+xml', 'text/html', 'text/plain']),
  requestedUrl: CanonicalPublicSourceUrlSchema,
  schemaVersion: z.literal('lumi.research-source/v1'),
  sourceRef: z.string().trim().min(1).max(2_048),
  text: z.string().min(1).max(MAX_SOURCE_TEXT_LENGTH),
  title: z.string().trim().min(1).max(500).nullable(),
  truncated: z.boolean(),
})
export type ResearchSourceRecord = z.infer<typeof ResearchSourceRecordSchema>

export interface PublicSourceDocument {
  finalUrl: string
  mediaType: ResearchSourceRecord['mediaType']
  requestedUrl: string
  text: string
  title: string | null
  truncated: boolean
}

export interface PublicSourceFetcher {
  fetch(url: string, signal: AbortSignal): Promise<PublicSourceDocument>
}

export interface ResearchSourceStore {
  save(
    record: Omit<ResearchSourceRecord, 'sourceRef'>,
  ): Promise<{ record: ResearchSourceRecord; reused: boolean }>
}

export interface ResearchTaskPort {
  submit(request: TaskRequest): Promise<TaskRecord>
}

export interface ResearchSourceInvocation {
  sourceTaskId: string
}

export class ResearchWorkflowError extends Error {
  constructor(
    readonly code:
      | 'DEPENDENCY_UNAVAILABLE'
      | 'INVALID_INPUT'
      | 'PERMISSION_DENIED'
      | 'VERIFICATION_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'ResearchWorkflowError'
  }
}

export class ResearchBriefWorkflow {
  constructor(private readonly tasks: ResearchTaskPort) {}

  submit(principal: Principal, input: ResearchBriefSubmission): Promise<TaskRecord> {
    if (principal.kind !== 'owner') {
      throw new ResearchWorkflowError(
        'PERMISSION_DENIED',
        'Only the configured owner may submit a research brief',
      )
    }
    const brief = ResearchBriefSubmissionSchema.parse(input)
    return this.tasks.submit(createTaskRequest({
      actorId: principal.id,
      channel: 'research-brief',
      content: brief.question,
      contextRefs: [
        RESEARCH_WORKFLOW_REFERENCE,
        ...brief.sources.map(encodeResearchSourceReference),
      ],
      ...(brief.id ? { id: brief.id } : {}),
    }))
  }
}

export interface ResearchSourceServiceOptions {
  fetcher: PublicSourceFetcher
  ledger: TaskLedger
  now?: () => string
  store: ResearchSourceStore
}

export class ResearchSourceService {
  readonly #now: () => string

  constructor(private readonly options: ResearchSourceServiceOptions) {
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  async capture(
    principal: Principal,
    input: ResearchFetchSubmission,
    invocation: ResearchSourceInvocation,
    signal: AbortSignal,
  ): Promise<ResearchSourceRecord> {
    if (principal.kind !== 'owner') {
      throw new ResearchWorkflowError(
        'PERMISSION_DENIED',
        'Only the configured owner may capture research sources',
      )
    }
    const submission = ResearchFetchSubmissionSchema.parse(input)
    try {
      const document = await this.options.fetcher.fetch(submission.url, signal)
      const requestedUrl = normalizePublicSourceUrl(document.requestedUrl)
      const finalUrl = normalizePublicSourceUrl(document.finalUrl)
      if (requestedUrl !== submission.url) {
        throw new ResearchWorkflowError(
          'INVALID_INPUT',
          'The source provider changed the requested URL',
        )
      }
      const text = document.text.trim()
      if (text.length === 0 || text.length > MAX_SOURCE_TEXT_LENGTH) {
        throw new ResearchWorkflowError(
          'INVALID_INPUT',
          'The normalized source text is empty or exceeds the configured limit',
        )
      }
      const contentDigest = digest(text)
      const sourceId = sourceIdFor(finalUrl, contentDigest)
      const fetchedAt = this.#now()
      const snapshot = {
        contentDigest,
        fetchedAt,
        finalUrl,
        id: sourceId,
        mediaType: document.mediaType,
        requestedUrl,
        schemaVersion: 'lumi.research-source/v1' as const,
        text,
        title: normalizeTitle(document.title),
        truncated: document.truncated,
      }
      const stored = await this.options.store.save(snapshot)
      const record = ResearchSourceRecordSchema.parse(stored.record)
      this.options.ledger.appendEvent(
        invocation.sourceTaskId,
        'research.source_captured',
        {
          contentDigest: record.contentDigest,
          finalUrl: record.finalUrl,
          requestedUrl: submission.url,
          reused: stored.reused,
          sourceId: record.id,
          sourceRef: record.sourceRef,
          truncated: record.truncated,
        },
      )
      this.options.ledger.appendAudit({
        action: 'research.source.capture',
        actorId: principal.id,
        detail: {
          contentDigest: record.contentDigest,
          finalUrl: record.finalUrl,
          requestedUrl: record.requestedUrl,
          reused: stored.reused,
          sourceId: record.id,
          truncated: record.truncated,
        },
        outcome: 'succeeded',
        targetId: invocation.sourceTaskId,
      })
      return record
    } catch (error) {
      this.options.ledger.appendAudit({
        action: 'research.source.capture',
        actorId: principal.id,
        detail: {
          code: errorCode(error),
          requestedUrl: submission.url,
        },
        outcome: 'failed',
        targetId: invocation.sourceTaskId,
      })
      throw error
    }
  }
}

export class ResearchEvidenceExecutor implements TaskExecutor {
  constructor(
    private readonly delegate: TaskExecutor,
    private readonly ledger: TaskLedger,
  ) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const result = await this.delegate.execute(input)
    if (input.capability.id !== 'research-agent') return result

    const declaredUrls = researchSourceUrlsFromContextRefs(input.task.contextRefs)
    const captures = this.ledger.listEvents(input.task.id)
      .filter(event => event.type === 'research.source_captured')
      .map(event => capturedSource(event.payload))
      .filter((source): source is CapturedSource => source !== undefined)
    const capturedByUrl = new Map(captures.map(source => [source.requestedUrl, source]))
    const missingUrls = declaredUrls.filter(url => !capturedByUrl.has(url))
    const uncitedSourceIds = captures
      .map(source => source.sourceId)
      .filter(sourceId => !result.output.includes(sourceId))
    const failure = declaredUrls.length === 0
      ? 'Research workflow declared no public sources'
      : missingUrls.length > 0
        ? `Research did not capture ${missingUrls.length} declared source(s)`
        : uncitedSourceIds.length > 0
          ? `Research result did not cite ${uncitedSourceIds.length} captured source(s)`
          : undefined

    if (failure) {
      this.#recordVerification(input, 'failed', failure, captures.length)
      throw new ResearchWorkflowError('VERIFICATION_FAILED', failure)
    }
    this.#recordVerification(
      input,
      'passed',
      `Research result cites all ${captures.length} captured source(s)`,
      captures.length,
    )
    return result
  }

  async close(): Promise<void> {
    await this.delegate.close?.()
  }

  #recordVerification(
    input: ExecutionInput,
    status: 'failed' | 'passed',
    reason: string,
    sourceCount: number,
  ): void {
    this.ledger.appendEvent(input.task.id, 'verification.completed', {
      reason,
      sourceCount,
      status,
      verifierVersion: 'research-citation-coverage/1',
      workflow: 'research-brief',
    })
    this.ledger.appendAudit({
      action: 'research.verify',
      actorId: input.task.actorId,
      detail: {
        reason,
        sourceCount,
        verifierVersion: 'research-citation-coverage/1',
      },
      outcome: status === 'passed' ? 'succeeded' : 'failed',
      targetId: input.task.id,
    })
  }
}

export function normalizePublicSourceUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_SOURCE_URL_LENGTH) {
    throw new Error(`Source URL must contain between 1 and ${MAX_SOURCE_URL_LENGTH} characters`)
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Source URL must be an absolute URL')
  }
  if (url.protocol !== 'https:') throw new Error('Source URL must use HTTPS')
  if (url.username !== '' || url.password !== '') {
    throw new Error('Source URL must not contain credentials')
  }
  if (url.port !== '') throw new Error('Source URL must use the default HTTPS port')
  if (url.hash !== '') throw new Error('Source URL must not contain a fragment')
  if (url.hostname === '' || isIP(stripIpv6Brackets(url.hostname)) !== 0) {
    throw new Error('Source URL must use a DNS hostname')
  }
  return url.toString()
}

export function encodeResearchSourceReference(url: string): string {
  const canonical = normalizePublicSourceUrl(url)
  return `${SOURCE_REFERENCE_PREFIX}${Buffer.from(canonical, 'utf8').toString('base64url')}`
}

export function researchSourceUrlsFromContextRefs(references: readonly string[]): string[] {
  const sources: string[] = []
  for (const reference of references) {
    if (!reference.startsWith(SOURCE_REFERENCE_PREFIX)) continue
    const encoded = reference.slice(SOURCE_REFERENCE_PREFIX.length)
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) continue
    try {
      const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
      const canonical = normalizePublicSourceUrl(decoded)
      if (encodeResearchSourceReference(canonical) === reference) sources.push(canonical)
    } catch {
      // Malformed external context references are ignored and cannot grant access.
    }
  }
  return [...new Set(sources)]
}

export function isResearchWorkflowRequest(request: TaskRequest): boolean {
  return request.contextRefs.includes(RESEARCH_WORKFLOW_REFERENCE)
}

function sourceIdFor(finalUrl: string, contentDigest: string): string {
  const value = createHash('sha256')
    .update(finalUrl, 'utf8')
    .update('\0', 'utf8')
    .update(contentDigest, 'utf8')
    .digest('hex')
    .slice(0, 24)
  return `source_${value}`
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
}

function normalizeTitle(title: string | null): string | null {
  if (title === null) return null
  const normalized = title.replace(/\s+/g, ' ').trim()
  return normalized.length === 0 ? null : normalized.slice(0, 500)
}

interface CapturedSource {
  requestedUrl: string
  sourceId: string
}

function capturedSource(payload: Record<string, JsonValue>): CapturedSource | undefined {
  const requestedUrl = payload.requestedUrl
  const sourceId = payload.sourceId
  if (typeof requestedUrl !== 'string' || typeof sourceId !== 'string') return undefined
  return { requestedUrl, sourceId }
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code')
    if (typeof code === 'string') return code
  }
  return 'SOURCE_CAPTURE_FAILED'
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}
