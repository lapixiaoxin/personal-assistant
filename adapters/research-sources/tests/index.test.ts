import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResearchSourceRecord } from '@lumi/research-workflow'
import {
  createPinnedLookup,
  HttpsPublicSourceFetcher,
  isPublicAddress,
  LocalResearchSourceStore,
  normalizeSourceBody,
  type PinnedHttpsTransport,
  type PublicDnsResolver,
} from '../src/index.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory =>
    rm(directory, { force: true, recursive: true }),
  ))
})

describe('public source boundaries', () => {
  it.each([
    ['8.8.8.8', true],
    ['93.184.216.34', true],
    ['2606:4700:4700::1111', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['169.254.169.254', false],
    ['192.168.1.2', false],
    ['100.64.0.1', false],
    ['::1', false],
    ['fc00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false],
    ['2001:db8::1', false],
  ])('classifies %s as public=%s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })

  it('pins every redirect hop to validated public DNS results', async () => {
    const resolve = vi.fn(async (hostname: string) => [{
      address: hostname === 'example.com' ? '93.184.216.34' : '1.1.1.1',
      family: 4 as const,
    }])
    const request = vi.fn(async (url: URL) => url.hostname === 'example.com'
      ? {
          body: Buffer.alloc(0),
          headers: { location: 'https://www.example.org/final' },
          statusCode: 302,
        }
      : {
          body: Buffer.from('<html><head><title>Evidence</title></head><body>Main fact</body></html>'),
          headers: { 'content-type': 'text/html; charset=utf-8' },
          statusCode: 200,
        })
    const fetcher = new HttpsPublicSourceFetcher({
      resolver: { resolve } satisfies PublicDnsResolver,
      transport: { request } satisfies PinnedHttpsTransport,
    })

    const document = await fetcher.fetch(
      'https://example.com/start',
      new AbortController().signal,
    )

    expect(resolve).toHaveBeenNthCalledWith(1, 'example.com')
    expect(resolve).toHaveBeenNthCalledWith(2, 'www.example.org')
    expect(request).toHaveBeenCalledTimes(2)
    expect(document).toMatchObject({
      finalUrl: 'https://www.example.org/final',
      requestedUrl: 'https://example.com/start',
      text: 'Evidence Main fact',
      title: 'Evidence',
      truncated: false,
    })
  })

  it('returns only validated addresses for Node single and all lookup modes', () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 as const },
      { address: '2606:4700:4700::1111', family: 6 as const },
    ]
    const pinnedLookup = createPinnedLookup(addresses)
    const lookupAll = pinnedLookup as unknown as (
      hostname: string,
      options: { all: true },
      callback: (
        error: NodeJS.ErrnoException | null,
        result: readonly typeof addresses[number][],
      ) => void,
    ) => void
    const lookupOne = pinnedLookup as unknown as (
      hostname: string,
      options: { all: false },
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void,
    ) => void

    lookupAll('example.com', { all: true }, (error, result) => {
      expect(error).toBeNull()
      expect(result).toEqual(addresses)
    })
    lookupOne('example.com', { all: false }, (error, address, family) => {
      expect(error).toBeNull()
      expect({ address, family }).toEqual(addresses[0])
    })
  })

  it('rejects mixed public and private DNS before transport', async () => {
    const request = vi.fn()
    const fetcher = new HttpsPublicSourceFetcher({
      resolver: {
        resolve: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      },
      transport: { request } satisfies PinnedHttpsTransport,
    })

    await expect(fetcher.fetch(
      'https://example.com/',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects unsupported response types and redirect overflow', async () => {
    const resolver: PublicDnsResolver = {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    }
    const binaryFetcher = new HttpsPublicSourceFetcher({
      resolver,
      transport: {
        request: async () => ({
          body: Buffer.from([0, 1, 2]),
          headers: { 'content-type': 'application/octet-stream' },
          statusCode: 200,
        }),
      },
    })
    await expect(binaryFetcher.fetch(
      'https://example.com/file',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const compressedFetcher = new HttpsPublicSourceFetcher({
      resolver,
      transport: {
        request: async () => ({
          body: Buffer.from('compressed'),
          headers: {
            'content-encoding': 'gzip',
            'content-type': 'text/plain',
          },
          statusCode: 200,
        }),
      },
    })
    await expect(compressedFetcher.fetch(
      'https://example.com/compressed',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const redirectFetcher = new HttpsPublicSourceFetcher({
      maxRedirects: 1,
      resolver,
      transport: {
        request: async () => ({
          body: Buffer.alloc(0),
          headers: { location: 'https://example.com/again' },
          statusCode: 302,
        }),
      },
    })
    await expect(redirectFetcher.fetch(
      'https://example.com/start',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('source normalization and snapshots', () => {
  it('uses an HTML parser and excludes executable or style content', () => {
    const normalized = normalizeSourceBody(Buffer.from(`
      <html>
        <head>
          <title>  Test report </title>
          <style>.secret { color: red }</style>
          <script>runDangerousInstruction()</script>
        </head>
        <body><main><h1>Finding</h1><p>Supported evidence.</p></main></body>
      </html>
    `), 'text/html; charset=UTF-8')

    expect(normalized).toMatchObject({
      mediaType: 'text/html',
      text: 'Test report\nFinding\nSupported evidence.',
      title: 'Test report',
      truncated: false,
    })
    expect(normalized.text).not.toContain('runDangerousInstruction')
    expect(normalized.text).not.toContain('color: red')
  })

  it('limits normalized text without splitting the stored contract', () => {
    const normalized = normalizeSourceBody(
      Buffer.from('123456789'),
      'text/plain',
      5,
    )
    expect(normalized).toMatchObject({ text: '12345', truncated: true })
  })

  it('writes immutable snapshots and reuses an exact existing record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lumi-research-source-'))
    directories.push(directory)
    const store = new LocalResearchSourceStore(directory)
    const record = sourceRecord()

    const first = await store.save(record)
    const second = await store.save(record)

    expect(first.reused).toBe(false)
    expect(second).toEqual({ record: first.record, reused: true })
    expect(await store.read(record.id)).toEqual({
      ...record,
      sourceRef: first.record.sourceRef,
    })
    await expect(store.save({
      ...record,
      fetchedAt: '2026-09-25T01:00:00.000Z',
      requestedUrl: 'https://www.example.com/redirect',
    })).resolves.toEqual({
      record: first.record,
      reused: true,
    })

    await expect(store.save({
      ...record,
      text: 'Changed content under the same source ID',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

function sourceRecord(): Omit<ResearchSourceRecord, 'sourceRef'> {
  return {
    contentDigest: `sha256:${'a'.repeat(64)}`,
    fetchedAt: '2026-09-25T00:00:00.000Z',
    finalUrl: 'https://example.com/report',
    id: 'source_0123456789abcdef01234567',
    mediaType: 'text/html',
    requestedUrl: 'https://example.com/report',
    schemaVersion: 'lumi.research-source/v1',
    text: 'Stable evidence',
    title: 'Report',
    truncated: false,
  }
}
