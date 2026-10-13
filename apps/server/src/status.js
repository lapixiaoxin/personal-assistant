import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readServerConfig } from '@lumi/dsh-channels-plugin/config'

try {
  const config = readServerConfig(resolve(process.env.LUMI_SERVER_CONFIG ?? 'data/server/config.json'))
  const statusPath = join(config.dataDir, 'status.json')
  const db = new DatabaseSync(join(config.dataDir, 'channels.db'), { readOnly: true })
  try {
    process.stdout.write(`${JSON.stringify({
      transport: existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : null,
      counts: db.prepare('SELECT state, count(*) AS count FROM inbox GROUP BY state').all(),
      unresolved: db.prepare(`SELECT id, state, receipt, updated_at FROM inbox
        WHERE state IN ('interrupted','unknown') ORDER BY seq DESC LIMIT 20`).all(),
    }, null, 2)}\n`)
  } finally { db.close() }
} catch {
  process.stderr.write('Cannot read server status. Check configuration and whether the server has initialized its database.\n')
  process.exitCode = 1
}
