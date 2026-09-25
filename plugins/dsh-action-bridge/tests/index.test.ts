import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allowedToolNames,
  apply,
  resolveBridgeEnvironment,
  toolGuardReason,
  type BridgeContext,
  type BridgeToolDefinition,
} from '../src/index.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('DSH action bridge plugin', () => {
  it('allows only the explicit protected-profile tool set', () => {
    for (const toolName of allowedToolNames) {
      expect(toolGuardReason(toolName)).toBeUndefined()
    }
    for (const toolName of [
      'bash',
      'edit',
      'mcp_send_message',
      'run_code',
      'web_fetch',
      'web_search',
      'workflow',
      'write',
    ]) {
      expect(toolGuardReason(toolName)).toContain('disabled by the lumi protected profile')
    }
  })

  it('requires a loopback bridge origin and a high-entropy token', () => {
    expect(resolveBridgeEnvironment({
      LUMI_ACTION_BRIDGE_TOKEN: 'a'.repeat(43),
      LUMI_ACTION_BRIDGE_URL: 'http://127.0.0.1:4312',
    })).toEqual({
      token: 'a'.repeat(43),
      url: 'http://127.0.0.1:4312',
    })

    expect(() => resolveBridgeEnvironment({
      LUMI_ACTION_BRIDGE_TOKEN: 'a'.repeat(43),
      LUMI_ACTION_BRIDGE_URL: 'http://localhost:4312',
    })).toThrow('must be an http://127.0.0.1:<port>/ origin')
    expect(() => resolveBridgeEnvironment({
      LUMI_ACTION_BRIDGE_TOKEN: 'short',
      LUMI_ACTION_BRIDGE_URL: 'http://127.0.0.1:4312',
    })).toThrow('must contain between 43 and 512 characters')
  })

  it('registers broker tools without exposing the bridge token in results', async () => {
    vi.stubEnv('LUMI_ACTION_BRIDGE_TOKEN', 'bridge-secret-'.padEnd(43, 'x'))
    vi.stubEnv('LUMI_ACTION_BRIDGE_URL', 'http://127.0.0.1:4312')
    const definitions: BridgeToolDefinition[] = []
    const guards: Array<(execution: { readonly name: string }) => string | undefined> = []
    const context: BridgeContext = {
      tools: {
        guard(callback) {
          guards.push(callback)
          return () => undefined
        },
        register(definition) {
          definitions.push(definition)
          return () => undefined
        },
      },
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        actionDigest: `sha256:${'a'.repeat(64)}`,
        actionId: 'action-one',
        authorizationStatus: null,
        inputDigest: `sha256:${'b'.repeat(64)}`,
        operation: 'artifact.write',
        status: 'prepared',
        target: { artifactId: 'daily-note' },
        verificationStatus: null,
      },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 202,
    }))
    vi.stubGlobal('fetch', fetcher)

    await apply(context)
    expect(definitions.map(definition => definition.name)).toEqual([
      'lumi_artifact_prepare',
      'lumi_action_execute',
    ])
    expect(guards).toHaveLength(1)
    expect(guards[0]?.({ name: 'write' })).toContain('disabled')

    const prepare = definitions[0]
    const result = await prepare?.execute({
      artifact_id: 'daily-note',
      content: 'private body',
      idempotency_key: 'daily-note-1',
    }, {
      signal: new AbortController().signal,
    })
    expect(result).toContain('action-one')
    expect(result).not.toContain('bridge-secret')
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:4312/v1/actions/prepare'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${'bridge-secret-'.padEnd(43, 'x')}`,
        }),
        method: 'POST',
      }),
    )
  })
})
