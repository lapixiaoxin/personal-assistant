import type {
  ExecutionInput,
  ExecutionResult,
  TaskExecutor,
} from '@lumi/assistant-core'
import {
  appendPersonalContext,
  type PersonalContextProvider,
} from '@lumi/personal-context'
import type { MemoryPurpose } from '@lumi/personal-memory'
import type { TaskLedger } from '@lumi/task-ledger'

export class TaskPersonalContextAdapter implements TaskExecutor {
  constructor(
    private readonly delegate: TaskExecutor,
    private readonly contexts: PersonalContextProvider,
    private readonly ledger: Pick<TaskLedger, 'appendEvent'>,
    private readonly ownerId: string,
  ) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const purpose = purposeForCapability(input.capability.id)
    if (!purpose) return this.delegate.execute(input)
    const snapshot = this.contexts.snapshot({
      ownerId: this.ownerId,
      purpose,
    })
    if (snapshot.entries.length === 0) return this.delegate.execute(input)

    this.ledger.appendEvent(input.task.id, 'memory.context_attached', {
      count: snapshot.entries.length,
      memories: snapshot.entries.map(entry => ({
        id: entry.id,
        revision: entry.revision,
      })),
      purpose,
    })
    return this.delegate.execute({
      ...input,
      task: {
        ...input.task,
        content: appendPersonalContext(input.task.content, snapshot),
      },
    })
  }

  async close(): Promise<void> {
    await this.delegate.close?.()
  }
}

export function purposeForCapability(capabilityId: string): MemoryPurpose | undefined {
  if (capabilityId === 'personal-assistant') return 'general_assistance'
  if (capabilityId === 'coding-agent') return 'coding'
  if (capabilityId === 'research-agent') return 'research'
  if (capabilityId === 'meeting-agent') return 'meeting'
  return undefined
}
