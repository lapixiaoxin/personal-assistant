#!/usr/bin/env node

import { resolve } from 'node:path'
import { Command } from 'commander'
import { createTaskRequest, TaskStateSchema } from '@personal-assistant/contracts'
import {
  createAssistantRuntime,
  loadLocalEnvironment,
  type AssistantRuntime,
} from '@personal-assistant/runtime'

interface GlobalOptions {
  db?: string
}

loadLocalEnvironment()

const program = new Command()
  .name('personal-assistant')
  .description('Local CLI for the personal assistant task ledger')
  .option('--db <path>', 'SQLite database path')

program
  .command('submit')
  .description('Submit a task and wait for completion or an approval request')
  .argument('<content...>', 'task content')
  .option('--actor <id>', 'actor id', 'local-user')
  .option('--channel <name>', 'channel name', 'cli')
  .option('--context <refs...>', 'context references')
  .option('--id <task-id>', 'caller-provided idempotency key')
  .action(async (
    words: string[],
    options: { actor: string; channel: string; context?: string[]; id?: string },
  ) => withRuntime(async (runtime) => {
    const request = createTaskRequest({
      actorId: options.actor,
      channel: options.channel,
      content: words.join(' '),
      contextRefs: options.context ?? [],
      ...(options.id ? { id: options.id } : {}),
    })
    const task = await runtime.core.submit(request)
    print({
      approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
      task,
    })
  }))

program
  .command('get')
  .description('Get one task and its current approval')
  .argument('<task-id>')
  .action(async (taskId: string) => withRuntime(async (runtime) => {
    const task = runtime.core.requireTask(taskId)
    print({
      approval: runtime.ledger.getApprovalForTask(task.id) ?? null,
      task,
    })
  }))

program
  .command('list')
  .description('List persisted tasks')
  .option('--actor <id>', 'filter by actor id')
  .option('--limit <count>', 'maximum rows', '50')
  .option('--state <state>', 'filter by task state')
  .action(async (options: { actor?: string; limit: string; state?: string }) =>
    withRuntime(async (runtime) => {
      const state = options.state ? TaskStateSchema.parse(options.state) : undefined
      const limit = Number.parseInt(options.limit, 10)
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new Error('--limit must be an integer between 1 and 200')
      }
      print(runtime.ledger.listTasks({
        ...(options.actor ? { actorId: options.actor } : {}),
        limit,
        ...(state ? { state } : {}),
      }))
    }))

program
  .command('events')
  .description('List a task state and execution events')
  .argument('<task-id>')
  .action(async (taskId: string) => withRuntime(async (runtime) => {
    runtime.core.requireTask(taskId)
    print(runtime.ledger.listEvents(taskId))
  }))

program
  .command('audit')
  .description('List a task audit records')
  .argument('<task-id>')
  .action(async (taskId: string) => withRuntime(async (runtime) => {
    runtime.core.requireTask(taskId)
    print(runtime.ledger.listAudit(taskId))
  }))

for (const decision of ['approve', 'reject', 'cancel'] as const) {
  program
    .command(decision)
    .description(`${decision} a task`)
    .argument('<task-id>')
    .option('--actor <id>', 'actor id', 'local-user')
    .action(async (taskId: string, options: { actor: string }) =>
      withRuntime(async (runtime) => {
        const task = decision === 'approve'
          ? await runtime.core.approve(taskId, options.actor)
          : decision === 'reject'
            ? runtime.core.reject(taskId, options.actor)
            : runtime.core.cancel(taskId, options.actor)
        print(task)
      }))
}

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

async function withRuntime(action: (runtime: AssistantRuntime) => Promise<void>): Promise<void> {
  const globals = program.opts<GlobalOptions>()
  const runtime = createAssistantRuntime({
    ...(globals.db ? { dbPath: resolve(globals.db) } : {}),
  })
  try {
    await action(runtime)
  } finally {
    await runtime.close()
  }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}
