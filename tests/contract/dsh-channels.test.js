import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const directories = []
const models = []
const harnesses = []

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.close()
  for (const model of models.splice(0)) await model.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function directory() {
  mkdirSync(join(root, 'data'), { recursive: true })
  const path = mkdtempSync(join(root, 'data/channels-contract-'))
  directories.push(path)
  return path
}

async function start(path, model) {
  const token = randomUUID()
  const harness = new DeepSeekHarness({
    cwd: path,
    processCwd: root,
    dshHome: join(path, 'dsh'),
    patches: [
      resolve(root, 'profiles/server/cordis.patch.yml'),
      resolve(root, 'tests/fixtures/dsh-channels.patch.yml'),
    ],
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    initializeTimeoutMs: 20000,
    env: {
      PATH: process.env.PATH,
      HOME: path,
      DEEPSEEK_API_KEY: 'contract-key',
      DEEPSEEK_BASE_URL: `${model.baseURL}/v1`,
      LUMI_CHANNEL_TEST_CONFIG: JSON.stringify({
        dataDir: path, workspace: path, token, turnTimeoutMs: 10000,
        model: { provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 512 },
      }),
    },
  })
  harnesses.push(harness)
  await harness.start()
  const { port } = JSON.parse(readFileSync(join(path, 'ready.json'), 'utf8'))
  const request = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw new Error(`fixture HTTP ${response.status}`)
    return response.json()
  }
  return {
    harness, request,
    send(text, id = randomUUID(), overrides = {}) {
      return request('/input', {
        app_id: 'cli_test',
        sender: { sender_type: 'user', sender_id: { open_id: 'ou_owner' } },
        message: {
          message_id: `om_${id}`, chat_id: 'oc_chat', chat_type: 'p2p',
          message_type: 'text', content: JSON.stringify({ text }),
        },
        ...overrides,
      })
    },
    wait() { return request('/wait') },
  }
}

describe('DSH native channel composition', () => {
  it('serializes turns, restores history after process restart, and supports /new', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['success'], repeatLast: true, successText: 'native answer',
    })
    models.push(model)
    const path = directory()
    const first = await start(path, model)
    await first.send('Remember SYNTHETIC_CONTEXT_ONE', 'one')
    await first.send('Remember SYNTHETIC_CONTEXT_ONE', 'one')
    await first.send('Second turn', 'two')
    const result = await first.wait()
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent'])
    expect(result.replies.map(row => row.text)).toEqual(['native answer', 'native answer'])
    expect(model.requests).toHaveLength(2)
    expect(JSON.stringify(model.requests[1].body)).toContain('SYNTHETIC_CONTEXT_ONE')
    await first.harness.close()

    const second = await start(path, model)
    await second.send('After restart', 'three')
    const restored = await second.wait()
    expect(restored.sessions).toEqual(result.sessions)
    expect(JSON.stringify(model.requests[2].body)).toContain('SYNTHETIC_CONTEXT_ONE')
    await second.send('/new', 'new')
    await second.wait()
    await second.send('Fresh turn', 'four')
    const fresh = await second.wait()
    expect(fresh.sessions).not.toEqual(restored.sessions)
    expect(JSON.stringify(model.requests[3].body)).not.toContain('SYNTHETIC_CONTEXT_ONE')
    expect(model.requests).toHaveLength(4)
  }, 60000)

  it('does not call the model for strangers or commands and does not resend unknown replies', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['success'], successText: 'native answer',
    })
    models.push(model)
    const path = directory()
    const fixture = await start(path, model)
    await fixture.send('private', 'stranger', {
      sender: { sender_type: 'user', sender_id: { open_id: 'ou_stranger' } },
    })
    await fixture.send('/help', 'help')
    await fixture.send('unknown-send', 'unknown')
    await fixture.wait()
    await fixture.send('unknown-send', 'unknown')
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(1)
    expect(result.records.map(row => row.state)).toEqual(['sent', 'unknown'])
    await fixture.harness.close()
    const restarted = await start(path, model)
    await restarted.send('/status', 'status')
    const resumed = await restarted.wait()
    expect(resumed.replies).toHaveLength(1)
    expect(resumed.replies[0].text).toContain('unknown: 1')
    expect(model.requests).toHaveLength(1)
  }, 60000)

  it('keeps native shell execution disabled even if a model requests it', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['tool_call_success', 'success'],
      toolName: 'bash', toolArguments: '{"command":"printf must-not-run"}',
      successText: 'Tool was denied',
    })
    models.push(model)
    const fixture = await start(directory(), model)
    await fixture.send('Try a tool', 'blocked')
    const result = await fixture.wait()
    expect(result.replies[0].text).toBe('Tool was denied')
    const first = JSON.stringify(model.requests[0].body)
    expect(first).not.toContain('"name":"bash"')
    expect(JSON.stringify(model.requests[1].body)).toMatch(/disabled|not available|not found|not enabled|unknown/i)
  }, 30000)

  it('cancels a native running turn and removes queued input without another model call', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success'],
      successText: 'a deliberately slow reply', chunkSize: 1, chunkDelayMs: 200,
    })
    models.push(model)
    const fixture = await start(directory(), model)
    await fixture.send('Long request', 'running')
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1)
    await fixture.send('Queued request', 'queued')
    await fixture.send('/cancel', 'cancel')
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(1)
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent', 'sent'])
    expect(result.replies[0].text).toContain('取消')
    expect(result.replies[1].text).toContain('未提交给 DSH')
  }, 30000)

  it('does not replay a running message after a real process crash', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success', 'success'],
      successText: 'answer after recovery', chunkSize: 1, chunkDelayMs: 200,
    })
    models.push(model)
    const path = directory()
    const first = await start(path, model)
    await first.send('Before crash', 'running')
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1)
    const death = first.harness.client.subscribe(() => false)
    const died = expect(death.next()).rejects.toThrow()
    await first.request('/crash')
    await died
    await first.harness.close()
    const second = await start(path, model)
    expect((await second.wait()).records[0].state).toBe('interrupted')
    expect(model.requests).toHaveLength(1)
    await second.send('Continue with new input', 'after')
    const result = await second.wait()
    expect(model.requests).toHaveLength(2)
    expect(result.replies[0].text).toBe('answer after recovery')
    expect(result.records[0].state).toBe('interrupted')
  }, 60000)
})
