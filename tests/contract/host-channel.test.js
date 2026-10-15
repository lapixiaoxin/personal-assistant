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

async function start(path, model, streaming = false, channel = {}) {
  const token = randomUUID()
  const harness = new DeepSeekHarness({
    cwd: path,
    processCwd: root,
    dshHome: join(path, 'dsh'),
    patches: [
      resolve(root, 'profiles/server/cordis.patch.yml'),
      resolve(root, 'tests/fixtures/host-channel.patch.yml'),
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
        dataDir: path, workspace: path, token, turnTimeoutMs: 10000, streaming,
        groupChatIds: channel.groupChatIds, botOpenId: channel.botOpenId,
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
    sendMessage({
      text, id = randomUUID(), chatId = 'oc_chat', chatType = 'p2p', sender = 'ou_owner',
      rootId, threadId, mentions,
    }) {
      return request('/input', {
        app_id: 'cli_test',
        sender: { sender_type: 'user', sender_id: { open_id: sender } },
        message: {
          message_id: `om_${id}`, chat_id: chatId, chat_type: chatType,
          message_type: 'text', content: JSON.stringify({ text }),
          ...(rootId ? { root_id: rootId } : {}),
          ...(threadId ? { thread_id: threadId } : {}),
          ...(mentions ? { mentions } : {}),
        },
      })
    },
    wait() { return request('/wait') },
  }
}

describe('DSH native channel composition', () => {
  it.each([true, 'native'])('streams before turn/end, finishes two messages, and keeps commands as text (%s)', async mode => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success'],
      successText: 'a streaming native answer', chunkSize: 1, chunkDelayMs: 50,
    })
    models.push(model)
    const fixture = await start(directory(), model, mode)
    await fixture.send('Stream this reply', 'stream')
    await fixture.send('Stream this reply', 'stream')
    const result = await fixture.wait()
    expect(result.records[0].state).toBe('sent')
    expect(result.replies.map(row => row.part)).toEqual(['progress', 'answer'])
    expect(model.requests).toHaveLength(1)
    const answerCard = result.replies[1].cardId
    const partials = result.updates.filter(row => row.kind === 'write' && row.cardId === answerCard)
    expect(partials.some(row => row.beforeEnd && row.text.startsWith('a')
      && row.text.length < 'a streaming native answer'.length), JSON.stringify(result.updates)).toBe(true)
    expect(result.updates.filter(row => ['close', 'complete'].includes(row.kind))).toHaveLength(2)
    if (mode === 'native') {
      expect(result.updates.some(row => row.kind === 'progress' && row.beforeEnd)).toBe(true)
      expect(result.updates.find(row => row.kind === 'complete').status).toBe('done')
    }
    expect(result.updates.find(row => row.kind === 'replace' && row.part === 'answer').text)
      .toBe('a streaming native answer')
    expect(result.unresolvedStreams).toEqual([])
    await fixture.send('/help', 'help')
    const commands = await fixture.wait()
    expect(commands.replies).toHaveLength(3)
    expect(commands.replies[2].text).toContain('/help')
    expect(model.requests).toHaveLength(1)
  }, 30000)

  it.each([true, 'native'])('does not start DSH or replay messages after an unknown initial send (%s)', async mode => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['success'], successText: 'unused',
    })
    models.push(model)
    const path = directory()
    const first = await start(path, model, mode)
    await first.send('unknown-send', 'unknown')
    const result = await first.wait()
    expect(result.records[0].state).toBe('unknown')
    expect(result.unresolvedStreams[0].state).toBe('unknown')
    expect(result.replies).toEqual([])
    expect(model.requests).toHaveLength(0)
    await first.harness.close()
    const second = await start(path, model, mode)
    await second.send('unknown-send', 'unknown')
    expect((await second.wait()).replies).toEqual([])
    expect(model.requests).toHaveLength(0)
  }, 30000)

  it.each([true, 'native'])('replaces partial output with cancellation and closes both messages (%s)', async mode => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success'],
      successText: 'a deliberately slow answer', chunkSize: 1, chunkDelayMs: 200,
    })
    models.push(model)
    const fixture = await start(directory(), model, mode)
    await fixture.send('Long streaming request', 'running')
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1)
    await fixture.send('Queued request', 'queued')
    await fixture.send(mode === 'native' ? '/stop' : '/cancel', 'cancel')
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(1)
    expect(result.replies.filter(row => row.id === 'cli_test:om_running')).toHaveLength(2)
    expect(result.updates.find(row => row.kind === 'replace' && row.part === 'answer').text)
      .toContain('取消')
    expect(result.updates.filter(row => ['close', 'complete'].includes(row.kind))).toHaveLength(2)
    if (mode === 'native') expect(result.updates.find(row => row.kind === 'complete').status).toBe('interrupted')
    expect(result.replies.filter(row => row.text)).toHaveLength(2)
    expect(result.unresolvedStreams).toEqual([])
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent', 'sent'])
  }, 30000)

  it.each([true, 'native'])('closes known streams after a process crash even after switching to text (%s)', async mode => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success'],
      successText: 'a deliberately slow answer', chunkSize: 1, chunkDelayMs: 200,
    })
    models.push(model)
    const path = directory()
    const first = await start(path, model, mode)
    await first.send('Before streaming crash', 'running')
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1)
    const death = first.harness.client.subscribe(() => false)
    const died = expect(death.next()).rejects.toThrow()
    await first.request('/crash')
    await died
    await first.harness.close()
    const second = await start(path, model)
    const recovered = await second.wait()
    expect(model.requests).toHaveLength(1)
    expect(recovered.records[0].state).toBe('interrupted')
    expect(recovered.replies).toEqual([])
    expect(recovered.updates.filter(row => ['close', 'complete'].includes(row.kind))).toHaveLength(2)
    if (mode === 'native') expect(recovered.updates.find(row => row.kind === 'complete').status).toBe('interrupted')
    expect(recovered.updates.find(row => row.kind === 'replace' && row.part === 'answer').text)
      .toContain('服务中断')
    expect(recovered.unresolvedStreams).toEqual([])
  }, 60000)

  it('keeps each private topic in one session, starts a new topic for a new root, and restores topics after restart', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['success'], repeatLast: true, successText: 'native answer',
    })
    models.push(model)
    const path = directory()
    const first = await start(path, model)
    await first.sendMessage({ text: 'Remember SYNTHETIC_CONTEXT_ONE', id: 'topic_one' })
    await first.sendMessage({
      text: 'Second turn in the same topic', id: 'topic_one_reply',
      rootId: 'om_topic_one', threadId: 'omt_topic_one',
    })
    const result = await first.wait()
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent'])
    expect(result.replies.map(row => row.text)).toEqual(['native answer', 'native answer'])
    expect(model.requests).toHaveLength(2)
    expect(JSON.stringify(model.requests[1].body)).toContain('SYNTHETIC_CONTEXT_ONE')
    expect(result.envelopes.map(row => row.conversation)).toEqual([
      'cli_test:oc_chat:topic:om_topic_one', 'cli_test:oc_chat:topic:om_topic_one',
    ])
    expect(result.replies.every(row => row.replyInThread)).toBe(true)
    await first.harness.close()

    const second = await start(path, model)
    await second.sendMessage({
      text: 'After restart in the same topic', id: 'topic_one_after_restart',
      rootId: 'om_topic_one', threadId: 'omt_topic_one',
    })
    const restored = await second.wait()
    expect(restored.sessions).toEqual(result.sessions)
    expect(JSON.stringify(model.requests[2].body)).toContain('SYNTHETIC_CONTEXT_ONE')
    await second.sendMessage({ text: 'Fresh topic with no old context', id: 'topic_two' })
    const fresh = await second.wait()
    expect(fresh.sessions).not.toEqual(restored.sessions)
    expect(JSON.stringify(model.requests[3].body)).not.toContain('SYNTHETIC_CONTEXT_ONE')
    expect(model.requests).toHaveLength(4)
  }, 60000)

  it('shares only explicit @Bot root messages in an allowed group and isolates group topics', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['success'], repeatLast: true, successText: 'group answer',
    })
    models.push(model)
    const fixture = await start(directory(), model, false, {
      groupChatIds: ['oc_group'], botOpenId: 'ou_bot',
    })
    const mention = [{ key: '@_user_1', id: { open_id: 'ou_bot' }, mentioned_type: 'bot', name: 'lumi' }]
    await fixture.sendMessage({
      text: '@_user_1 GROUP_SHARED_CONTEXT_ONE', id: 'group_one',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_one', mentions: mention,
    })
    await fixture.sendMessage({
      text: '@_user_1 Group follow-up', id: 'group_two',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_two', mentions: mention,
    })
    await fixture.sendMessage({
      text: '@_user_1 TOPIC_START_CONTEXT', id: 'topic_start',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_one', mentions: mention,
      rootId: 'om_external_root', threadId: 'omt_group_topic',
    })
    await fixture.sendMessage({
      text: '@_user_1 Topic follow-up', id: 'topic_follow_up',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_two', mentions: mention,
      rootId: 'om_external_root', threadId: 'omt_group_topic',
    })
    await fixture.sendMessage({
      text: 'This group message does not invoke the Bot', id: 'ignored',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_three',
    })
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(4)
    expect(JSON.stringify(model.requests[1].body)).toContain('GROUP_SHARED_CONTEXT_ONE')
    expect(JSON.stringify(model.requests[2].body)).not.toContain('GROUP_SHARED_CONTEXT_ONE')
    expect(JSON.stringify(model.requests[2].body)).toContain('TOPIC_START_CONTEXT')
    expect(JSON.stringify(model.requests[3].body)).toContain('TOPIC_START_CONTEXT')
    expect(result.envelopes.map(row => row.conversation)).toEqual([
      'cli_test:oc_group:group', 'cli_test:oc_group:group',
      'cli_test:oc_group:topic:om_external_root', 'cli_test:oc_group:topic:om_external_root',
    ])
    expect(result.replies.slice(0, 2).every(row => row.replyInThread === false)).toBe(true)
    expect(result.replies.slice(2).every(row => row.replyInThread === true)).toBe(true)
    expect(result.sessions).toHaveLength(2)
  }, 60000)

  it('cancels only the current group topic and leaves the group @Bot queue intact', async () => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['slow_success', 'success'], repeatLast: true,
      successText: 'group answer', chunkSize: 1, chunkDelayMs: 150,
    })
    models.push(model)
    const fixture = await start(directory(), model, false, {
      groupChatIds: ['oc_group'], botOpenId: 'ou_bot',
    })
    const mention = [{ key: '@_user_1', id: { open_id: 'ou_bot' }, mentioned_type: 'bot', name: 'lumi' }]
    await fixture.sendMessage({
      text: '@_user_1 Long topic request', id: 'topic_running',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_one', mentions: mention,
      rootId: 'om_topic_root', threadId: 'omt_group_topic',
    })
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1)
    await fixture.sendMessage({
      text: '@_user_1 Group root request survives', id: 'group_queued',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_two', mentions: mention,
    })
    await fixture.sendMessage({
      text: '@_user_1 Queue in topic is cancelled', id: 'topic_queued',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_one', mentions: mention,
      rootId: 'om_topic_root', threadId: 'omt_group_topic',
    })
    await fixture.sendMessage({
      text: '@_user_1 /stop', id: 'topic_stop',
      chatId: 'oc_group', chatType: 'group', sender: 'ou_member_one', mentions: mention,
      rootId: 'om_topic_root', threadId: 'omt_group_topic',
    })
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(2)
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent', 'sent', 'sent'])
    expect(result.replies.find(row => row.id === 'cli_test:om_topic_queued').text).toContain('未提交给 DSH')
    expect(result.replies.find(row => row.id === 'cli_test:om_group_queued').text).toBe('group answer')
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
    await fixture.send('/new', 'new')
    await fixture.send('unknown-send', 'unknown')
    await fixture.wait()
    await fixture.send('unknown-send', 'unknown')
    const result = await fixture.wait()
    expect(model.requests).toHaveLength(1)
    expect(result.records.map(row => row.state)).toEqual(['sent', 'sent', 'unknown'])
    expect(result.replies.find(row => row.id === 'cli_test:om_new').text).toContain('下一条消息')
    await fixture.harness.close()
    const restarted = await start(path, model)
    await restarted.send('/status', 'status')
    const resumed = await restarted.wait()
    expect(resumed.replies).toHaveLength(1)
    expect(resumed.replies[0].text).toContain('unknown: 1')
    expect(model.requests).toHaveLength(1)
  }, 60000)

  it.each([false, 'native'])('keeps shell execution disabled and accurately projects denied calls (%s)', async mode => {
    const model = await startMockLlmServer({
      apiKey: 'contract-key', sequence: ['tool_call_success', 'success'],
      toolName: 'bash', toolArguments: '{"command":"printf must-not-run"}',
      successText: 'Tool was denied',
    })
    models.push(model)
    const fixture = await start(directory(), model, mode)
    await fixture.send('Try a tool', 'blocked')
    const result = await fixture.wait()
    if (mode === 'native') {
      expect(result.updates.find(row => row.kind === 'replace' && row.part === 'answer').text).toBe('Tool was denied')
      const events = result.updates.filter(row => row.kind === 'progress').flatMap(row => row.events)
      expect(events.some(row => row.kind === 'tool_started')).toBe(true)
      expect(events.some(row => row.kind === 'tool_finished' && row.failed)).toBe(true)
    } else expect(result.replies[0].text).toBe('Tool was denied')
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
