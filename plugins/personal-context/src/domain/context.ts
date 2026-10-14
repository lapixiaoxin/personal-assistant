import {
  MemoryKindSchema,
  MemoryPurposeSchema,
  MemoryScopeSchema,
  type MemoryPurpose,
  type PersonalMemory,
  type PersonalMemoryService,
} from './memory.ts'
import {
  computePersonalContextRevision as computePersonalContextRevisionCore,
  parsePersonalContextSnapshot as parsePersonalContextSnapshotCore,
  renderPersonalContext as renderPersonalContextCore,
} from './context-core.js'
import { z } from 'zod'

const IdentifierSchema = z.string().regex(/^[^\s]{1,128}$/)
const TimestampSchema = z.iso.datetime({ offset: true })
const SnapshotRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const PersonalContextEntrySchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  id: IdentifierSchema,
  kind: MemoryKindSchema,
  revision: z.number().int().positive(),
  scope: MemoryScopeSchema,
  source: z.string().trim().min(1).max(256),
}).strict()
export type PersonalContextEntry = z.infer<typeof PersonalContextEntrySchema>

export const PersonalContextSnapshotSchema = z.object({
  entries: z.array(PersonalContextEntrySchema).max(32),
  generatedAt: TimestampSchema,
  ownerId: IdentifierSchema,
  purpose: MemoryPurposeSchema,
  revision: SnapshotRevisionSchema,
  schemaVersion: z.literal('lumi.personal-context/v1'),
}).strict().superRefine((snapshot, context) => {
  const ids = new Set<string>()
  for (const [index, entry] of snapshot.entries.entries()) {
    if (ids.has(entry.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate personal context entry id: ${entry.id}`,
        path: ['entries', index, 'id'],
      })
    }
    ids.add(entry.id)
  }
  const expected = computePersonalContextRevision(snapshot)
  if (snapshot.revision !== expected) {
    context.addIssue({
      code: 'custom',
      message: 'Personal context revision does not match its canonical content',
      path: ['revision'],
    })
  }
})
export type PersonalContextSnapshot = z.infer<typeof PersonalContextSnapshotSchema>

export interface PersonalContextRequest {
  maxCharacters?: number
  maxItems?: number
  ownerId: string
  purpose: MemoryPurpose
}

export interface PersonalContextExpectations {
  ownerId?: string
  purpose?: MemoryPurpose
}

export interface PersonalContextProvider {
  snapshot(request: PersonalContextRequest): PersonalContextSnapshot
}

export class PersonalContextService implements PersonalContextProvider {
  constructor(
    private readonly memories: Pick<PersonalMemoryService, 'retrieve'>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  snapshot(request: PersonalContextRequest): PersonalContextSnapshot {
    const entries = this.memories.retrieve(request).map(toContextEntry)
    const base = {
      entries,
      generatedAt: this.now(),
      ownerId: request.ownerId,
      purpose: request.purpose,
      schemaVersion: 'lumi.personal-context/v1' as const,
    }
    return parsePersonalContextSnapshot(PersonalContextSnapshotSchema.parse({
      ...base,
      revision: computePersonalContextRevision(base),
    }))
  }
}

export function parsePersonalContextSnapshot(
  input: unknown,
  expectations: PersonalContextExpectations = {},
): PersonalContextSnapshot {
  return parsePersonalContextSnapshotCore(input, expectations) as PersonalContextSnapshot
}

export function renderPersonalContext(snapshot: PersonalContextSnapshot): string {
  return renderPersonalContextCore(snapshot)
}

export function appendPersonalContext(
  taskContent: string,
  snapshot: PersonalContextSnapshot,
): string {
  return [taskContent, '', renderPersonalContext(snapshot)].join('\n')
}

export function computePersonalContextRevision(
  snapshot: Pick<PersonalContextSnapshot, 'entries' | 'ownerId' | 'purpose' | 'schemaVersion'>,
): string {
  return computePersonalContextRevisionCore(snapshot)
}

function toContextEntry(memory: PersonalMemory): PersonalContextEntry {
  return PersonalContextEntrySchema.parse({
    content: memory.content,
    id: memory.id,
    kind: memory.kind,
    revision: memory.revision,
    scope: memory.scope,
    source: memory.source,
  })
}
