import { describe, expect, it, vi } from 'vitest'
import {
  createDshChildEnvironment,
  startDshActionBridge,
  type DshActionBroker,
} from '../src/index.ts'
import type {
  ActionDetail,
  ActionProposalSubmission,
  ActionStatus,
} from '@lumi/contracts'
import {
  encodeResearchSourceReference,
  type ResearchSourceRecord,
} from '@lumi/research-workflow'

const tokenHeader = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
})

describe('DSH per-Run action bridge', () => {
  it('authenticates, bounds, and validates prepare requests', async () => {
    const broker = fakeBroker()
    const bridge = await startDshActionBridge({
      broker,
      contextRefs: [],
      taskId: 'task-one',
    })
    const token = bridge.environment.LUMI_ACTION_BRIDGE_TOKEN
    expect(bridge.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(token).toHaveLength(43)

    try {
      const unauthorized = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(unauthorized.status).toBe(401)

      const readySignal = bridge.waitUntilReady()
      const ready = await fetch(`${bridge.url}/v1/ready`, {
        body: '{}',
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(ready.status).toBe(200)
      await expect(readySignal).resolves.toBeUndefined()

      const wrongType = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: '{}',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'text/plain',
        },
        method: 'POST',
      })
      expect(wrongType.status).toBe(415)

      const invalid = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: '{',
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(invalid.status).toBe(400)

      const invalidProposal = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: '{}',
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(invalidProposal.status).toBe(400)

      const wrongMethod = await fetch(`${bridge.url}/v1/actions/prepare`, {
        headers: tokenHeader(token ?? ''),
        method: 'GET',
      })
      expect(wrongMethod.status).toBe(405)

      const unknownPath = await fetch(`${bridge.url}/v1/unknown`, {
        body: '{}',
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(unknownPath.status).toBe(404)

      const queryPath = await fetch(`${bridge.url}/v1/actions/prepare?alternate=true`, {
        body: '{}',
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(queryPath.status).toBe(404)

      const oversized = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: JSON.stringify({ content: 'x'.repeat(1_100_001) }),
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(oversized.status).toBe(413)

      const accepted = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: JSON.stringify({
          content: 'sealed body',
          idempotencyKey: 'daily-note-1',
          operation: 'artifact.write',
          schemaVersion: 'lumi.action-proposal/v1',
          target: { artifactId: 'daily-note' },
        }),
        headers: tokenHeader(token ?? ''),
        method: 'POST',
      })
      expect(accepted.status).toBe(202)
      const body = await accepted.text()
      expect(body).toContain('"actionId":"action-one"')
      expect(body).not.toContain('sealed body')
      expect(body).not.toContain(token ?? 'missing-token')
      expect(broker.prepare).toHaveBeenCalledOnce()
    } finally {
      await bridge.close()
    }
  })

  it('executes only an action explicitly referenced by the task', async () => {
    const broker = fakeBroker('succeeded')
    const bridge = await startDshActionBridge({
      broker,
      contextRefs: ['lumi-action:action-allowed', 'unrelated'],
      taskId: 'task-one',
    })
    const token = bridge.environment.LUMI_ACTION_BRIDGE_TOKEN ?? ''
    try {
      const denied = await fetch(`${bridge.url}/v1/actions/action-other/execute`, {
        body: '{}',
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(denied.status).toBe(403)

      const accepted = await fetch(`${bridge.url}/v1/actions/action-allowed/execute`, {
        body: '{}',
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(accepted.status).toBe(200)
      expect(broker.execute).toHaveBeenCalledExactlyOnceWith(
        'action-allowed',
        { sourceTaskId: 'task-one' },
      )
    } finally {
      await bridge.close()
    }
  })

  it('fetches only an exact public source declared by the task', async () => {
    const sourceUrl = 'https://example.com/report'
    const capture = vi.fn(async (
      _input: unknown,
      _invocation: unknown,
      _signal: AbortSignal,
    ): Promise<ResearchSourceRecord> => {
      void _input
      void _invocation
      void _signal
      return {
        contentDigest: `sha256:${'b'.repeat(64)}`,
        fetchedAt: '2026-09-25T00:00:00.000Z',
        finalUrl: sourceUrl,
        id: 'source_0123456789abcdef01234567',
        mediaType: 'text/html',
        requestedUrl: sourceUrl,
        schemaVersion: 'lumi.research-source/v1',
        sourceRef: 'file:///tmp/source.json',
        text: 'Source evidence',
        title: 'Report',
        truncated: false,
      }
    })
    const bridge = await startDshActionBridge({
      broker: fakeBroker(),
      contextRefs: [encodeResearchSourceReference(sourceUrl)],
      enableActions: false,
      researchBroker: { capture },
      taskId: 'task-research',
    })
    const token = bridge.environment.LUMI_ACTION_BRIDGE_TOKEN ?? ''
    try {
      expect(bridge.environment.LUMI_ACTION_BRIDGE_ENABLED).toBe('0')
      expect(bridge.environment.LUMI_RESEARCH_BRIDGE_ENABLED).toBe('1')
      const actionDenied = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: JSON.stringify({
          content: 'not allowed',
          idempotencyKey: 'not-allowed',
          operation: 'artifact.write',
          schemaVersion: 'lumi.action-proposal/v1',
          target: { artifactId: 'not-allowed' },
        }),
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(actionDenied.status).toBe(403)

      const denied = await fetch(`${bridge.url}/v1/research/fetch`, {
        body: JSON.stringify({
          schemaVersion: 'lumi.research-fetch/v1',
          url: 'https://example.org/other',
        }),
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(denied.status).toBe(403)
      expect(capture).not.toHaveBeenCalled()

      const accepted = await fetch(`${bridge.url}/v1/research/fetch`, {
        body: JSON.stringify({
          schemaVersion: 'lumi.research-fetch/v1',
          url: sourceUrl,
        }),
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(accepted.status).toBe(200)
      expect(await accepted.text()).toContain('source_0123456789abcdef01234567')
      expect(capture).toHaveBeenCalledOnce()
      expect(capture.mock.calls[0]?.[0]).toEqual({
        schemaVersion: 'lumi.research-fetch/v1',
        url: sourceUrl,
      })
    } finally {
      await bridge.close()
    }
  })

  it('supports a protected Run with readiness but no Host capability', async () => {
    const bridge = await startDshActionBridge({
      contextRefs: [],
      enableActions: false,
      taskId: 'task-protected-only',
    })
    const token = bridge.environment.LUMI_ACTION_BRIDGE_TOKEN ?? ''
    try {
      expect(bridge.environment).toMatchObject({
        LUMI_ACTION_BRIDGE_ENABLED: '0',
      })
      expect(bridge.environment.LUMI_RESEARCH_BRIDGE_ENABLED).toBeUndefined()

      const readySignal = bridge.waitUntilReady()
      const ready = await fetch(`${bridge.url}/v1/ready`, {
        body: '{}',
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(ready.status).toBe(200)
      await expect(readySignal).resolves.toBeUndefined()

      const actionDenied = await fetch(`${bridge.url}/v1/actions/prepare`, {
        body: '{}',
        headers: tokenHeader(token),
        method: 'POST',
      })
      const researchDenied = await fetch(`${bridge.url}/v1/research/fetch`, {
        body: '{}',
        headers: tokenHeader(token),
        method: 'POST',
      })
      expect(actionDenied.status).toBe(403)
      expect(researchDenied.status).toBe(403)
    } finally {
      await bridge.close()
    }
  })

  it('isolates concurrent tokens and closes the listener with the Run', async () => {
    const first = await startDshActionBridge({
      broker: fakeBroker(),
      contextRefs: [],
      taskId: 'task-first',
    })
    const second = await startDshActionBridge({
      broker: fakeBroker(),
      contextRefs: [],
      taskId: 'task-second',
    })
    const firstToken = first.environment.LUMI_ACTION_BRIDGE_TOKEN ?? ''
    try {
      const crossed = await fetch(`${second.url}/v1/actions/prepare`, {
        body: '{}',
        headers: tokenHeader(firstToken),
        method: 'POST',
      })
      expect(crossed.status).toBe(401)
    } finally {
      await first.close()
      await second.close()
    }

    await expect(fetch(`${first.url}/v1/actions/prepare`, {
      body: '{}',
      headers: tokenHeader(firstToken),
      method: 'POST',
    })).rejects.toThrow()
  })

  it('removes Host and stale bridge variables from the DSH child environment', () => {
    expect(createDshChildEnvironment({
      DEEPSEEK_API_KEY: 'model-key',
      LUMI_ACTION_BRIDGE_TOKEN: 'stale-token',
      LUMI_RESEARCH_BRIDGE_ENABLED: '1',
      PA_HTTP_TOKEN: 'host-token',
      PA_OWNER_ID: 'host-owner',
      PATH: '/usr/bin',
    }, {
      LUMI_ACTION_BRIDGE_TOKEN: 'run-token',
      LUMI_ACTION_BRIDGE_URL: 'http://127.0.0.1:4312',
    })).toEqual({
      DEEPSEEK_API_KEY: 'model-key',
      LUMI_ACTION_BRIDGE_TOKEN: 'run-token',
      LUMI_ACTION_BRIDGE_URL: 'http://127.0.0.1:4312',
      PATH: '/usr/bin',
    })
  })
})

function fakeBroker(status: ActionStatus = 'prepared') {
  return {
    execute: vi.fn(async actionId => actionDetail(actionId, status)),
    prepare: vi.fn((input: ActionProposalSubmission) => {
      void input
      return actionDetail('action-one', status)
    }),
  } satisfies DshActionBroker
}

function actionDetail(actionId: string, status: ActionStatus): ActionDetail {
  const timestamp = '2026-09-25T00:00:00.000Z'
  const digest = `sha256:${'a'.repeat(64)}`
  return {
    action: {
      actionDigest: digest,
      authorizationId: null,
      cancellationRequestedAt: null,
      capability: { id: 'local-artifact', version: '1.0.0' },
      createdAt: timestamp,
      deadline: null,
      effect: 'local_artifact',
      id: actionId,
      idempotencyKey: 'daily-note-1',
      inputDigest: digest,
      inputRef: `action-input:${actionId}`,
      operation: 'artifact.write',
      ownerId: 'owner-one',
      principalId: 'principal-one',
      receiptId: null,
      revocationEpoch: 0,
      schemaVersion: 'lumi.action/v1',
      status,
      target: { artifactId: 'daily-note' },
      taskId: 'task-one',
      updatedAt: timestamp,
      verificationId: null,
    },
    authorization: null,
    receipt: null,
    task: {
      actorId: 'principal-one',
      capabilityId: null,
      channel: 'action-runtime',
      content: 'artifact.write daily-note',
      contextRefs: [],
      createdAt: timestamp,
      dshSessionId: null,
      error: null,
      id: 'task-one',
      result: null,
      state: 'queued',
      updatedAt: timestamp,
    },
    verification: null,
  }
}
