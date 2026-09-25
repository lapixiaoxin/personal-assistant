import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildGateway } from './server.ts'
import { loadLocalEnvironment } from '@lumi/runtime'

loadLocalEnvironment()
if (!process.env.PA_HTTP_TOKEN) {
  throw new Error('PA_HTTP_TOKEN is required to start the lumi Gateway')
}
const host = process.env.PA_HOST ?? '127.0.0.1'
const port = parsePort(process.env.PA_PORT)
const workbenchDir = resolve(process.cwd(), 'dist/workbench')
const app = buildGateway({
  logger: true,
  workbenchDir: existsSync(workbenchDir) ? workbenchDir : false,
})

const shutdown = async (): Promise<void> => {
  await app.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

try {
  const address = await app.listen({ host, port })
  app.log.info({ address }, 'lumi gateway ready')
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
  await app.close()
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 4310 : Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PA_PORT must be an integer between 1 and 65535')
  }
  return port
}
