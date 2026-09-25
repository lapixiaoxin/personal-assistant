import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
const token = 'e2e.token.not.a.secret.0123456789'

test('runs the task approval flow without layout overflow', async ({ page, request }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => consoleErrors.push(error.message))

  const suffix = `${testInfo.project.name}-${Date.now()}`
  await request.post('/v1/tasks', {
    data: {
      actorId: 'local-user',
      channel: 'web',
      content: `整理 ${suffix} 的工作简报`,
      id: `task-brief-${suffix}`,
    },
    headers: { authorization: `Bearer ${token}` },
  })
  const approvalResponse = await request.post('/v1/tasks', {
    data: {
      actorId: 'local-user',
      channel: 'web',
      content: `发送 ${suffix} 的项目进展给团队`,
      id: `task-approval-${suffix}`,
    },
    headers: { authorization: `Bearer ${token}` },
  })
  expect(approvalResponse.status()).toBe(202)

  await page.goto(`/#token=${token}`)
  await expect(page).toHaveTitle('lumi')
  await expect(page.locator('.user-message p')).toHaveText(`发送 ${suffix} 的项目进展给团队`)
  await expect(page.getByText('需要确认')).toBeVisible()

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalOverflow).toBe(true)

  await page.getByRole('button', { name: '允许' }).click()
  await expect(page.locator('.state-badge')).toHaveText('已完成')

  const screenshotDir = join(process.cwd(), 'data', 'workbench-evidence')
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `${testInfo.project.name}.png`),
  })
  expect(consoleErrors).toEqual([])
})

test('authorizes and verifies a bound action from the inbox', async ({ page, request }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => consoleErrors.push(error.message))

  const suffix = `${testInfo.project.name}-${Date.now()}`
  const artifactId = `workbench-${suffix}`
  const content = `Verified workbench artifact for ${suffix}`
  const prepared = await request.post('/v2/actions', {
    data: {
      content,
      idempotencyKey: `workbench-action-${suffix}`,
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId },
    },
    headers: { authorization: `Bearer ${token}` },
  })
  expect(prepared.status()).toBe(202)
  const actionId = (await prepared.json()).data.action.id as string

  await page.goto(`/#token=${token}`)
  await page.getByRole('tab', { name: /动作/ }).click()
  await page.getByRole('button', { name: new RegExp(artifactId) }).click()

  await expect(page.locator('.state-badge')).toHaveText('待授权')
  await expect(page.getByText('Action digest')).toBeVisible()
  await expect(page.getByText('Input digest')).toBeVisible()
  await expect(page.getByRole('button', { name: '执行动作' })).toHaveCount(0)

  await page.getByRole('button', { name: '授权动作' }).click()
  await expect(page.locator('.state-badge')).toHaveText('已授权')
  await expect(page.getByText('授权 ID')).toBeVisible()

  await page.getByRole('button', { name: '执行动作' }).click()
  await expect(page.locator('.state-badge')).toHaveText('已验证')
  await expect(page.getByText('执行回执')).toBeVisible()
  await expect(page.getByText('结果验证')).toBeVisible()

  const fetched = await request.get(`/v2/actions/${actionId}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(fetched.status()).toBe(200)
  const action = (await fetched.json()).data
  expect(action.action.status).toBe('succeeded')
  expect(action.verification.status).toBe('passed')
  expect(await readFile(fileURLToPath(action.receipt.artifactRef), 'utf8')).toBe(content)

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalOverflow).toBe(true)

  const screenshotDir = join(process.cwd(), 'data', 'workbench-evidence')
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `action-${testInfo.project.name}.png`),
  })
  expect(consoleErrors).toEqual([])
})

test('submits a bounded research brief and reports offline verification failure', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => consoleErrors.push(error.message))

  const suffix = `${testInfo.project.name}-${Date.now()}`
  const question = `比较公开来源 ${suffix}`
  await page.goto(`/#token=${token}`)
  await page.getByRole('tab', { name: '研究简报' }).click()
  await page.getByLabel('研究问题').fill(question)
  await page.getByLabel('公开来源').fill(
    'https://example.com/\nhttps://example.org/report',
  )
  await page.getByRole('button', { name: '提交研究简报' }).click()

  await expect(page.locator('.user-message p')).toHaveText(question)
  await expect(page.locator('.conversation-header .eyebrow')).toHaveText('research-agent')
  await expect(page.locator('.state-badge')).toHaveText('失败')
  await expect(page.locator('.error-copy')).toContainText('did not capture 2 declared source')
  await expect(page.getByRole('link', { name: 'https://example.com/' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://example.org/report' })).toBeVisible()

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalOverflow).toBe(true)

  const screenshotDir = join(process.cwd(), 'data', 'workbench-evidence')
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `research-${testInfo.project.name}.png`),
  })
  expect(consoleErrors).toEqual([])
})

test('submits and verifies a structured meeting brief', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => consoleErrors.push(error.message))

  const suffix = `${testInfo.project.name}-${Date.now()}`
  await page.goto(`/#token=${token}`)
  await page.getByRole('tab', { name: '会议准备' }).click()
  await page.getByLabel('会议主题').fill(`路线评审 ${suffix}`)
  await page.getByLabel('会议目标').fill('确定下一阶段优先级')
  await page.getByLabel('参与者').fill('产品负责人\n研发负责人')
  await page.getByLabel('会议议程').fill('回顾目标\n比较候选项\n确认责任人')
  await page.getByLabel('会议背景').fill('交付日期保持不变')
  await page.getByRole('button', { name: '提交会议准备' }).click()

  await expect(page.locator('.conversation-header .eyebrow')).toHaveText('meeting-agent')
  await expect(page.locator('.state-badge')).toHaveText('已完成')
  await expect(page.getByRole('heading', { name: '决策与问题' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '跟进事项' })).toBeVisible()
  await expect(page.getByText('<!-- lumi.meeting-brief/v1 -->')).toHaveCount(0)
  await expect(page.getByText('verification / completed')).toBeVisible()

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalOverflow).toBe(true)

  const screenshotDir = join(process.cwd(), 'data', 'workbench-evidence')
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `meeting-${testInfo.project.name}.png`),
  })
  expect(consoleErrors).toEqual([])
})

test('manages a persistent personal memory from the memory vault', async ({ page, request }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => consoleErrors.push(error.message))

  const suffix = `${testInfo.project.name}-${Date.now()}`
  const initialContent = `Prefer concise summaries ${suffix}`
  const correctedContent = `Prefer decision-first summaries ${suffix}`
  await page.goto(`/#token=${token}`)
  await page.getByRole('tab', { name: '记忆' }).click()
  await page.getByRole('button', { name: '新增记忆' }).click()
  await page.getByLabel('记忆内容').fill(initialContent)
  await page.locator('.memory-status-field').getByRole('button', { name: '候选' }).click()
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.locator('.state-badge')).toHaveText('候选')
  const listed = await request.get('/v2/memories?status=candidate', {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(listed.status()).toBe(200)
  const memory = ((await listed.json()).data as Array<{ content: string; id: string }>)
    .find(item => item.content === initialContent)
  expect(memory?.id).toBeTruthy()

  await page.getByRole('button', { name: '确认记忆' }).click()
  await expect(page.locator('.state-badge')).toHaveText('已确认')
  await page.getByRole('button', { name: '纠正' }).click()
  await page.getByLabel('记忆内容').fill(correctedContent)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText(correctedContent).first()).toBeVisible()

  await page.getByRole('button', { name: '撤回' }).click()
  await expect(page.locator('.state-badge')).toHaveText('已撤回')
  await page.getByRole('button', { name: '彻底遗忘' }).click()
  await page.getByRole('button', { name: '确认彻底遗忘' }).click()
  await expect(page.getByText(correctedContent)).toHaveCount(0)

  const missing = await request.get(`/v2/memories/${memory?.id}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(missing.status()).toBe(404)
  expect((await missing.json()).error.code).toBe('MEMORY_NOT_FOUND')

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noHorizontalOverflow).toBe(true)

  const screenshotDir = join(process.cwd(), 'data', 'workbench-evidence')
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    fullPage: true,
    path: join(screenshotDir, `memory-${testInfo.project.name}.png`),
  })
  expect(consoleErrors).toEqual([])
})
