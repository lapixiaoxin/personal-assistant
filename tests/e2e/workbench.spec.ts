import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

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
  })
  const approvalResponse = await request.post('/v1/tasks', {
    data: {
      actorId: 'local-user',
      channel: 'web',
      content: `发送 ${suffix} 的项目进展给团队`,
      id: `task-approval-${suffix}`,
    },
  })
  expect(approvalResponse.status()).toBe(202)

  await page.goto('/')
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
