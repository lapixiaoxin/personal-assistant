import { devices, defineConfig } from '@playwright/test'

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  outputDir: 'data/playwright-results',
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
  reporter: 'list',
  testDir: 'tests/e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4312',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'PA_EXECUTOR=mock PA_PORT=4312 PA_DATA_DIR=./data/workbench-e2e node dist/gateway/main.js',
    reuseExistingServer: false,
    timeout: 15_000,
    url: 'http://127.0.0.1:4312/health',
  },
})
