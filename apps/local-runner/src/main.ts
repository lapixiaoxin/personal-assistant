#!/usr/bin/env node

import { resolve } from 'node:path'
import { Command } from 'commander'
import { createTaskRequest, TaskStateSchema } from '@lumi/contracts'
import {
  createAssistantRuntime,
  loadLocalEnvironment,
  type AssistantRuntime,
} from '@lumi/runtime'

interface GlobalOptions {
  db?: string
}

loadLocalEnvironment()

const program = new Command()
  .name('lumi')
  .description('Local CLI for the lumi personal agent task ledger')
  .option('--db <path>', 'SQLite database path')

program
  .command('submit')
  .description('Submit a task and wait for completion or an approval request')
  .argument('<content...>', 'task content')
  .option('--actor <id>', 'legacy actor assertion')
  .option('--channel <name>', 'channel name', 'cli')
  .option('--context <refs...>', 'context references')
  .option('--id <task-id>', 'caller-provided idempotency key')
  .action(async (
    words: string[],
    options: { actor?: string; channel: string; context?: string[]; id?: string },
  ) => withRuntime(async (runtime) => {
    const principal = runtime.identity.localPrincipal()
    if (options.actor) assertActor(principal.id, options.actor)
    const request = createTaskRequest({
      actorId: principal.id,
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
  .command('research')
  .description('Build a cited brief from explicitly declared public HTTPS sources')
  .argument('<question...>', 'research question')
  .option('--id <task-id>', 'caller-provided idempotency key')
  .option(
    '--source <url>',
    'public HTTPS source; repeat for multiple sources',
    collectOption,
    [],
  )
  .action(async (
    words: string[],
    options: { id?: string; source: string[] },
  ) => withRuntime(async (runtime) => {
    const task = await runtime.research.submit(runtime.identity.localPrincipal(), {
      ...(options.id ? { id: options.id } : {}),
      question: words.join(' '),
      schemaVersion: 'lumi.research-brief/v1',
      sources: options.source,
    })
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
    assertV1Task(task.channel, taskId)
    assertActor(runtime.identity.localPrincipal().id, task.actorId)
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
      const principal = runtime.identity.localPrincipal()
      if (options.actor) assertActor(principal.id, options.actor)
      const state = options.state ? TaskStateSchema.parse(options.state) : undefined
      const limit = Number.parseInt(options.limit, 10)
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new Error('--limit must be an integer between 1 and 200')
      }
      print(runtime.ledger.listTasks({
        actorId: principal.id,
        limit: 200,
        ...(state ? { state } : {}),
      }).filter(task => task.channel !== 'action-runtime').slice(0, limit))
    }))

program
  .command('events')
  .description('List a task state and execution events')
  .argument('<task-id>')
  .action(async (taskId: string) => withRuntime(async (runtime) => {
    const task = runtime.core.requireTask(taskId)
    assertV1Task(task.channel, taskId)
    assertActor(runtime.identity.localPrincipal().id, task.actorId)
    print(runtime.ledger.listEvents(taskId))
  }))

program
  .command('audit')
  .description('List a task audit records')
  .argument('<task-id>')
  .action(async (taskId: string) => withRuntime(async (runtime) => {
    const task = runtime.core.requireTask(taskId)
    assertV1Task(task.channel, taskId)
    assertActor(runtime.identity.localPrincipal().id, task.actorId)
    print(runtime.ledger.listAudit(taskId))
  }))

for (const decision of ['approve', 'reject', 'cancel'] as const) {
  program
    .command(decision)
    .description(`${decision} a task`)
    .argument('<task-id>')
    .option('--actor <id>', 'legacy actor assertion')
    .action(async (taskId: string, options: { actor?: string }) =>
      withRuntime(async (runtime) => {
        const principal = runtime.identity.localPrincipal()
        if (options.actor) assertActor(principal.id, options.actor)
        const existing = runtime.core.requireTask(taskId)
        assertV1Task(existing.channel, taskId)
        assertActor(principal.id, existing.actorId)
        const task = decision === 'approve'
          ? await runtime.core.approve(taskId, principal.id)
          : decision === 'reject'
            ? runtime.core.reject(taskId, principal.id)
            : runtime.core.cancel(taskId, principal.id)
        print(task)
      }))
}

const action = program
  .command('action')
  .description('Prepare and execute verified local artifact actions')

action
  .command('prepare')
  .argument('<artifact-id>')
  .argument('<content...>')
  .requiredOption('--key <idempotency-key>')
  .option('--deadline <rfc3339>')
  .action(async (
    artifactId: string,
    words: string[],
    options: { deadline?: string; key: string },
  ) => withRuntime(async (runtime) => {
    print(runtime.actions.prepare(runtime.identity.localPrincipal(), {
      ...(options.deadline ? { deadline: options.deadline } : {}),
      content: words.join(' '),
      idempotencyKey: options.key,
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId },
    }))
  }))

action
  .command('list')
  .option('--limit <count>', 'maximum rows', '50')
  .action(async (options: { limit: string }) => withRuntime(async (runtime) => {
    const limit = parseLimit(options.limit)
    print(runtime.actions.list(runtime.identity.localPrincipal(), limit))
  }))

action
  .command('get')
  .argument('<action-id>')
  .action(async (actionId: string) => withRuntime(async (runtime) => {
    print(runtime.actions.get(runtime.identity.localPrincipal(), actionId))
  }))

for (const operation of ['authorize', 'execute', 'reconcile', 'cancel'] as const) {
  action
    .command(operation)
    .argument('<action-id>')
    .action(async (actionId: string) => withRuntime(async (runtime) => {
      const principal = runtime.identity.localPrincipal()
      const result = operation === 'authorize'
        ? runtime.actions.authorize(principal, actionId)
        : operation === 'execute'
          ? await runtime.actions.execute(principal, actionId)
          : operation === 'reconcile'
            ? await runtime.actions.reconcile(principal, actionId)
            : runtime.actions.cancel(principal, actionId)
      print(result)
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

function assertActor(principalId: string, actorId: string): void {
  if (principalId !== actorId) {
    throw new Error('The requested actor does not match the configured local principal')
  }
}

function parseLimit(value: string): number {
  const limit = Number.parseInt(value, 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('--limit must be an integer between 1 and 200')
  }
  return limit
}

function assertV1Task(channel: string, taskId: string): void {
  if (channel === 'action-runtime') {
    throw new Error(`Task not found: ${taskId}; use the action commands for v2 actions`)
  }
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value]
}
