import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ipaddr from 'ipaddr.js'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import {
  normalizePublicSourceUrl,
  ResearchSourceRecordSchema,
  type PublicSourceDocument,
  type PublicSourceFetcher,
  type ResearchSourceRecord,
  type ResearchSourceStore,
} from '@lumi/research-workflow'

const DEFAULT_MAX_BYTES = 1_048_576
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_MAX_TEXT_LENGTH = 50_000
const DEFAULT_TIMEOUT_MS = 10_000
const BLOCKED_HTML_ELEMENTS = new Set([
  'canvas',
  'iframe',
  'noscript',
  'script',
  'style',
  'svg',
  'template',
])
const TEXT_BREAK_ELEMENTS = new Set([
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

export type ResearchSourceErrorCode =
  | 'DEADLINE_EXCEEDED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'PERMISSION_DENIED'

export class ResearchSourceError extends Error {
  constructor(
    readonly code: ResearchSourceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ResearchSourceError'
  }
}

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

export interface PublicDnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>
}

export interface RawHttpsResponse {
  body: Buffer
  headers: Readonly<Record<string, string | string[] | undefined>>
  statusCode: number
}

export interface PinnedHttpsTransport {
  request(
    url: URL,
    addresses: readonly ResolvedAddress[],
    signal: AbortSignal,
    maxBytes: number,
  ): Promise<RawHttpsResponse>
}

export interface HttpsPublicSourceFetcherOptions {
  maxBytes?: number
  maxRedirects?: number
  maxTextLength?: number
  resolver?: PublicDnsResolver
  timeoutMs?: number
  transport?: PinnedHttpsTransport
}

export class HttpsPublicSourceFetcher implements PublicSourceFetcher {
  readonly #maxBytes: number
  readonly #maxRedirects: number
  readonly #maxTextLength: number
  readonly #resolver: PublicDnsResolver
  readonly #timeoutMs: number
  readonly #transport: PinnedHttpsTransport

  constructor(options: HttpsPublicSourceFetcherOptions = {}) {
    this.#maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes')
    this.#maxRedirects = nonnegativeInteger(
      options.maxRedirects,
      DEFAULT_MAX_REDIRECTS,
      'maxRedirects',
    )
    this.#maxTextLength = positiveInteger(
      options.maxTextLength,
      DEFAULT_MAX_TEXT_LENGTH,
      'maxTextLength',
    )
    this.#timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs')
    this.#resolver = options.resolver ?? new NodePublicDnsResolver()
    this.#transport = options.transport ?? new NodePinnedHttpsTransport()
  }

  async fetch(value: string, callerSignal: AbortSignal): Promise<PublicSourceDocument> {
    const requestedUrl = normalizePublicSourceUrl(value)
    const signal = AbortSignal.any([
      callerSignal,
      AbortSignal.timeout(this.#timeoutMs),
    ])
    try {
      const fetched = await this.#fetchFollowingRedirects(new URL(requestedUrl), signal)
      const contentEncoding = singleHeader(fetched.response.headers['content-encoding'])
        ?.trim()
        .toLowerCase()
      if (contentEncoding && contentEncoding !== 'identity') {
        throw new ResearchSourceError(
          'INVALID_INPUT',
          'The public source returned an unsupported content encoding',
        )
      }
      const normalized = normalizeSourceBody(
        fetched.response.body,
        fetched.response.headers['content-type'],
        this.#maxTextLength,
      )
      return {
        finalUrl: fetched.url.toString(),
        mediaType: normalized.mediaType,
        requestedUrl,
        text: normalized.text,
        title: normalized.title,
        truncated: normalized.truncated,
      }
    } catch (error) {
      if (error instanceof ResearchSourceError) throw error
      if (signal.aborted) {
        throw new ResearchSourceError(
          'DEADLINE_EXCEEDED',
          'The public source request exceeded its deadline',
        )
      }
      throw new ResearchSourceError(
        'DEPENDENCY_UNAVAILABLE',
        'The public source could not be retrieved',
      )
    }
  }

  async #fetchFollowingRedirects(
    initialUrl: URL,
    signal: AbortSignal,
  ): Promise<{ response: RawHttpsResponse; url: URL }> {
    let current = initialUrl
    for (let redirectCount = 0; redirectCount <= this.#maxRedirects; redirectCount++) {
      const canonical = new URL(normalizePublicSourceUrl(current.toString()))
      const addresses = await this.#resolver.resolve(canonical.hostname)
      assertPublicAddresses(addresses)
      const response = await this.#transport.request(
        canonical,
        addresses,
        signal,
        this.#maxBytes,
      )
      if (!isRedirect(response.statusCode)) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new ResearchSourceError(
            'DEPENDENCY_UNAVAILABLE',
            `The public source returned HTTP ${response.statusCode}`,
          )
        }
        return { response, url: canonical }
      }
      if (redirectCount === this.#maxRedirects) {
        throw new ResearchSourceError('INVALID_INPUT', 'The public source redirected too many times')
      }
      const location = singleHeader(response.headers.location)
      if (!location) {
        throw new ResearchSourceError(
          'DEPENDENCY_UNAVAILABLE',
          'The public source returned a redirect without a Location header',
        )
      }
      current = new URL(location, canonical)
    }
    throw new ResearchSourceError('INVALID_INPUT', 'The public source redirected too many times')
  }
}

export class NodePublicDnsResolver implements PublicDnsResolver {
  async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    let addresses
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true })
    } catch {
      throw new ResearchSourceError(
        'DEPENDENCY_UNAVAILABLE',
        'The public source hostname could not be resolved',
      )
    }
    return addresses.map(address => ({
      address: address.address,
      family: address.family as 4 | 6,
    }))
  }
}

export class NodePinnedHttpsTransport implements PinnedHttpsTransport {
  request(
    url: URL,
    addresses: readonly ResolvedAddress[],
    signal: AbortSignal,
    maxBytes: number,
  ): Promise<RawHttpsResponse> {
    const pinned = addresses[0]
    if (!pinned) {
      return Promise.reject(new ResearchSourceError(
        'DEPENDENCY_UNAVAILABLE',
        'The public source hostname returned no addresses',
      ))
    }
    return new Promise((resolveResponse, reject) => {
      const options: RequestOptions = {
        headers: {
          accept: 'text/html, application/xhtml+xml, text/plain;q=0.9',
          'accept-encoding': 'identity',
          'user-agent': 'lumi-research/0.1',
        },
        lookup: createPinnedLookup(addresses),
        method: 'GET',
        signal,
      }
      const request = httpsRequest(url, options, (response) => {
        const declaredLength = Number.parseInt(response.headers['content-length'] ?? '0', 10)
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.destroy()
          reject(new ResearchSourceError('INVALID_INPUT', 'The public source body is too large'))
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.from(chunk)
          bytes += buffer.byteLength
          if (bytes > maxBytes) {
            response.destroy(new ResearchSourceError(
              'INVALID_INPUT',
              'The public source body is too large',
            ))
            return
          }
          chunks.push(buffer)
        })
        response.once('error', reject)
        response.once('end', () => {
          resolveResponse({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode: response.statusCode ?? 0,
          })
        })
      })
      request.once('error', reject)
      request.end()
    })
  }
}

export function createPinnedLookup(
  addresses: readonly ResolvedAddress[],
): NonNullable<RequestOptions['lookup']> {
  const pinned = addresses[0]
  if (!pinned) {
    throw new ResearchSourceError(
      'DEPENDENCY_UNAVAILABLE',
      'The public source hostname returned no addresses',
    )
  }
  return (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      const returnAll = callback as (
        error: NodeJS.ErrnoException | null,
        result: readonly ResolvedAddress[],
      ) => void
      returnAll(null, addresses)
      return
    }
    const returnOne = callback as (
      error: NodeJS.ErrnoException | null,
      address: string,
      family: number,
    ) => void
    returnOne(null, pinned.address, pinned.family)
  }
}

export class LocalResearchSourceStore implements ResearchSourceStore {
  readonly #configuredRoot: string

  constructor(root: string) {
    this.#configuredRoot = resolve(root)
  }

  async save(
    input: Omit<ResearchSourceRecord, 'sourceRef'>,
  ): Promise<{ record: ResearchSourceRecord; reused: boolean }> {
    const root = await this.#ensureRoot()
    const targetPath = join(root, `${input.id}.json`)
    const sourceRef = pathToFileURL(targetPath).href
    const record = ResearchSourceRecordSchema.parse({ ...input, sourceRef })
    const serialized = `${JSON.stringify(record, null, 2)}\n`
    const temporaryPath = join(root, `.lumi-${randomUUID()}.tmp`)
    let temporaryCreated = false
    try {
      const handle = await open(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
      temporaryCreated = true
      try {
        await handle.writeFile(serialized, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await link(temporaryPath, targetPath)
        return { record, reused: false }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const existing = await this.read(record.id)
        if (snapshotIdentity(existing) !== snapshotIdentity(record)) {
          throw new ResearchSourceError(
            'INVALID_INPUT',
            'The immutable research source snapshot conflicts with existing data',
          )
        }
        return { record: existing, reused: true }
      }
    } finally {
      if (temporaryCreated) {
        await unlink(temporaryPath).catch(() => undefined)
      }
    }
  }

  async read(sourceId: string): Promise<ResearchSourceRecord> {
    if (!/^source_[a-f0-9]{24}$/.test(sourceId)) {
      throw new ResearchSourceError('INVALID_INPUT', 'Invalid research source ID')
    }
    const root = await this.#ensureRoot()
    const targetPath = join(root, `${sourceId}.json`)
    const handle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) {
        throw new ResearchSourceError(
          'INVALID_INPUT',
          'Research source snapshot is not a regular file',
        )
      }
      return ResearchSourceRecordSchema.parse(JSON.parse(await handle.readFile('utf8')))
    } finally {
      await handle.close()
    }
  }

  async #ensureRoot(): Promise<string> {
    await mkdir(this.#configuredRoot, { mode: 0o700, recursive: true })
    const stat = await lstat(this.#configuredRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new ResearchSourceError(
        'INVALID_INPUT',
        'Research source root must be a real directory',
      )
    }
    return realpath(this.#configuredRoot)
  }
}

function snapshotIdentity(record: ResearchSourceRecord): string {
  return JSON.stringify({
    contentDigest: record.contentDigest,
    finalUrl: record.finalUrl,
    id: record.id,
    mediaType: record.mediaType,
    schemaVersion: record.schemaVersion,
    text: record.text,
    title: record.title,
    truncated: record.truncated,
  })
}

export function isPublicAddress(address: string): boolean {
  let parsed
  try {
    parsed = ipaddr.parse(address)
  } catch {
    return false
  }
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address()
  }
  return parsed.range() === 'unicast'
}

export function normalizeSourceBody(
  body: Buffer,
  contentTypeHeader: string | string[] | undefined,
  maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
): {
  mediaType: ResearchSourceRecord['mediaType']
  text: string
  title: string | null
  truncated: boolean
} {
  const contentType = parseContentType(contentTypeHeader)
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new ResearchSourceError('INVALID_INPUT', 'The public source is not valid UTF-8')
  }
  if (contentType.mediaType === 'text/plain') {
    const normalized = normalizeWhitespace(decoded)
    return limitedText(normalized, null, contentType.mediaType, maxTextLength)
  }
  const document = parse(decoded)
  const title = findTitle(document)
  const pieces: string[] = []
  collectText(document, pieces, false)
  return limitedText(
    normalizeWhitespace(pieces.join(' ')),
    title,
    contentType.mediaType,
    maxTextLength,
  )
}

function parseContentType(value: string | string[] | undefined): {
  mediaType: ResearchSourceRecord['mediaType']
} {
  const raw = singleHeader(value)
  if (!raw) {
    throw new ResearchSourceError('INVALID_INPUT', 'The public source has no Content-Type')
  }
  const [mediaTypeValue, ...parameters] = raw.toLowerCase().split(';')
  const mediaType = mediaTypeValue?.trim()
  if (
    mediaType !== 'text/html'
    && mediaType !== 'application/xhtml+xml'
    && mediaType !== 'text/plain'
  ) {
    throw new ResearchSourceError(
      'INVALID_INPUT',
      'The public source Content-Type is not supported',
    )
  }
  for (const parameter of parameters) {
    const [name, parameterValue] = parameter.split('=', 2).map(item => item.trim())
    if (name === 'charset' && parameterValue && !['utf-8', 'utf8'].includes(parameterValue)) {
      throw new ResearchSourceError(
        'INVALID_INPUT',
        'The public source must use UTF-8 text',
      )
    }
  }
  return { mediaType }
}

function collectText(
  node: DefaultTreeAdapterTypes.Node,
  pieces: string[],
  blocked: boolean,
): void {
  const tagName = 'tagName' in node ? node.tagName.toLowerCase() : undefined
  const isBlocked = blocked || (tagName !== undefined && BLOCKED_HTML_ELEMENTS.has(tagName))
  if (!isBlocked && 'value' in node) pieces.push(node.value)
  if ('childNodes' in node) {
    if (!isBlocked && tagName && TEXT_BREAK_ELEMENTS.has(tagName)) pieces.push('\n')
    for (const child of node.childNodes) collectText(child, pieces, isBlocked)
    if (!isBlocked && tagName && TEXT_BREAK_ELEMENTS.has(tagName)) pieces.push('\n')
  }
}

function findTitle(node: DefaultTreeAdapterTypes.Node): string | null {
  if ('tagName' in node && node.tagName.toLowerCase() === 'title') {
    const pieces: string[] = []
    collectText(node, pieces, false)
    const title = normalizeWhitespace(pieces.join(' '))
    return title === '' ? null : title.slice(0, 500)
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const title = findTitle(child)
      if (title) return title
    }
  }
  return null
}

function limitedText(
  text: string,
  title: string | null,
  mediaType: ResearchSourceRecord['mediaType'],
  maxTextLength: number,
) {
  if (text.length === 0) {
    throw new ResearchSourceError('INVALID_INPUT', 'The public source contains no readable text')
  }
  const truncated = text.length > maxTextLength
  return {
    mediaType,
    text: truncated ? text.slice(0, maxTextLength).trimEnd() : text,
    title,
    truncated,
  }
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
}

function assertPublicAddresses(addresses: readonly ResolvedAddress[]): void {
  if (addresses.length === 0) {
    throw new ResearchSourceError(
      'DEPENDENCY_UNAVAILABLE',
      'The public source hostname returned no addresses',
    )
  }
  if (addresses.some(address => !isPublicAddress(address.address))) {
    throw new ResearchSourceError(
      'PERMISSION_DENIED',
      'The public source resolved to a non-public address',
    )
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode)
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const candidate = value ?? fallback
  if (!Number.isInteger(candidate) || candidate <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return candidate
}

function nonnegativeInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const candidate = value ?? fallback
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${name} must be a nonnegative integer`)
  }
  return candidate
}
