import { resolve } from 'node:path'
import { startServer } from './index.js'

process.umask(0o077)
const configPath = resolve(process.env.LUMI_SERVER_CONFIG ?? 'data/server/config.json')
let server
try {
  server = await startServer(configPath)
  process.stdout.write('lumi ready · DSH server + Feishu private chat\n')
  let stop
  const signal = new Promise(resolve => { stop = resolve })
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    await Promise.race([server.exited, signal])
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
} catch {
  process.stderr.write('lumi could not stay running. Check the private server configuration and status.json; credentials are not printed.\n')
  process.exitCode = 1
} finally {
  try { await server?.close() } catch {
    process.stderr.write('lumi shutdown did not complete cleanly; inspect process state before restarting.\n')
    process.exitCode = 1
  }
}
