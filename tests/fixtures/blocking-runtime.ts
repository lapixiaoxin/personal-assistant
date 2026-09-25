import { resolve } from 'node:path'
import { createTaskRequest } from '../../packages/contracts/src/index.ts'
import { createAssistantRuntime } from '../../apps/runtime/src/index.ts'

const database = process.argv[2]
if (!database) throw new Error('Database path is required')

const runtime = createAssistantRuntime({
  dbPath: resolve(database),
  executor: {
    execute: async () => {
      process.stdout.write('RUNNING\n')
      return new Promise(() => undefined)
    },
  },
})

await runtime.ready
void runtime.core.submit(createTaskRequest({
  actorId: runtime.identity.localPrincipal().id,
  channel: 'cli',
  content: 'Summarize work after a forced host crash',
  id: 'task-forced-crash',
}))

setInterval(() => undefined, 60_000)
