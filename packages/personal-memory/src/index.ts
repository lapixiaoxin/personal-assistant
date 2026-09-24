import { createId } from '@lumi/contracts'
import { z } from 'zod'

export const PersonalMemorySchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string().trim().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
  kind: z.enum(['fact', 'preference', 'relationship', 'experience']),
  ownerId: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  source: z.string().trim().min(1),
  status: z.enum(['candidate', 'confirmed', 'retracted']),
  updatedAt: z.iso.datetime({ offset: true }),
})
export type PersonalMemory = z.infer<typeof PersonalMemorySchema>

export interface PersonalMemoryStore {
  get(id: string): PersonalMemory | undefined
  list(ownerId: string): PersonalMemory[]
  put(memory: PersonalMemory): void
}

export class InMemoryPersonalMemoryStore implements PersonalMemoryStore {
  readonly #records = new Map<string, PersonalMemory>()

  get(id: string): PersonalMemory | undefined {
    return this.#records.get(id)
  }

  list(ownerId: string): PersonalMemory[] {
    return [...this.#records.values()].filter((memory) => memory.ownerId === ownerId)
  }

  put(memory: PersonalMemory): void {
    this.#records.set(memory.id, PersonalMemorySchema.parse(memory))
  }
}

export class PersonalMemoryService {
  constructor(
    private readonly store: PersonalMemoryStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  recordCandidate(input: {
    confidence: number
    content: string
    kind: PersonalMemory['kind']
    ownerId: string
    scope: string
    source: string
  }): PersonalMemory {
    const timestamp = this.now()
    const memory = PersonalMemorySchema.parse({
      ...input,
      createdAt: timestamp,
      id: createId('memory'),
      status: 'candidate',
      updatedAt: timestamp,
    })
    this.store.put(memory)
    return memory
  }

  confirm(id: string): PersonalMemory {
    return this.#changeStatus(id, 'confirmed')
  }

  retract(id: string): PersonalMemory {
    return this.#changeStatus(id, 'retracted')
  }

  #changeStatus(id: string, status: PersonalMemory['status']): PersonalMemory {
    const existing = this.store.get(id)
    if (!existing) throw new Error(`Memory not found: ${id}`)
    const updated = PersonalMemorySchema.parse({
      ...existing,
      status,
      updatedAt: this.now(),
    })
    this.store.put(updated)
    return updated
  }
}
