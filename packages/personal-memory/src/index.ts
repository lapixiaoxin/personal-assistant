import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { createId, type Principal } from '@lumi/contracts'
import { z } from 'zod'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType
}

export const MemoryKindSchema = z.enum([
  'fact',
  'preference',
  'relationship',
  'experience',
])
export type MemoryKind = z.infer<typeof MemoryKindSchema>

export const MemoryScopeSchema = z.enum([
  'global',
  'general',
  'coding',
  'research',
  'meeting',
])
export type MemoryScope = z.infer<typeof MemoryScopeSchema>

export const MemoryClassificationSchema = z.enum([
  'public',
  'personal',
  'sensitive',
  'secret',
])
export type MemoryClassification = z.infer<typeof MemoryClassificationSchema>

export const MemoryPurposeSchema = z.enum([
  'general_assistance',
  'coding',
  'research',
  'meeting',
])
export type MemoryPurpose = z.infer<typeof MemoryPurposeSchema>

export const MemoryStatusSchema = z.enum(['candidate', 'confirmed', 'retracted'])
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>

const IdentifierSchema = z.string().trim().min(1).max(128)
const TimestampSchema = z.iso.datetime({ offset: true })
const MemoryPurposesSchema = z.array(MemoryPurposeSchema)
  .min(1)
  .max(4)
  .transform(purposes => [...new Set(purposes)])

export const PersonalMemorySchema = z.object({
  allowedPurposes: MemoryPurposesSchema,
  classification: MemoryClassificationSchema,
  confidence: z.number().min(0).max(1),
  confirmedAt: TimestampSchema.nullable(),
  content: z.string().trim().min(1).max(4_000),
  createdAt: TimestampSchema,
  id: IdentifierSchema,
  kind: MemoryKindSchema,
  ownerId: IdentifierSchema,
  retractedAt: TimestampSchema.nullable(),
  revision: z.number().int().positive(),
  scope: MemoryScopeSchema,
  source: z.string().trim().min(1).max(256),
  status: MemoryStatusSchema,
  updatedAt: TimestampSchema,
})
export type PersonalMemory = z.infer<typeof PersonalMemorySchema>

export const PersonalMemoryCreateSchema = z.object({
  allowedPurposes: MemoryPurposesSchema.default(['general_assistance']),
  classification: MemoryClassificationSchema.default('personal'),
  confidence: z.number().min(0).max(1).default(1),
  content: z.string().trim().min(1).max(4_000),
  kind: MemoryKindSchema.default('preference'),
  scope: MemoryScopeSchema.default('global'),
  source: z.string().trim().min(1).max(256).default('explicit_user_input'),
  status: z.enum(['candidate', 'confirmed']).default('confirmed'),
})
export type PersonalMemoryCreate = z.input<typeof PersonalMemoryCreateSchema>

export const PersonalMemoryCorrectionSchema = z.object({
  allowedPurposes: MemoryPurposesSchema.optional(),
  classification: MemoryClassificationSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  content: z.string().trim().min(1).max(4_000),
  kind: MemoryKindSchema.optional(),
  scope: MemoryScopeSchema.optional(),
  source: z.string().trim().min(1).max(256).default('explicit_user_correction'),
})
export type PersonalMemoryCorrection = z.input<typeof PersonalMemoryCorrectionSchema>

export const PersonalMemoryListQuerySchema = z.object({
  classification: MemoryClassificationSchema.optional(),
  kind: MemoryKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  scope: MemoryScopeSchema.optional(),
  status: MemoryStatusSchema.optional(),
})
export type PersonalMemoryListQuery = z.input<typeof PersonalMemoryListQuerySchema>

export const PersonalMemoryTombstoneSchema = z.object({
  contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  erasedAt: TimestampSchema,
  id: IdentifierSchema,
  lastRevision: z.number().int().positive(),
  ownerId: IdentifierSchema,
})
export type PersonalMemoryTombstone = z.infer<typeof PersonalMemoryTombstoneSchema>

export interface PersonalMemoryStore {
  close(): void
  create(memory: PersonalMemory): void
  forget(ownerId: string, id: string, expectedRevision: number, tombstone: PersonalMemoryTombstone): void
  get(ownerId: string, id: string): PersonalMemory | undefined
  getTombstone(ownerId: string, id: string): PersonalMemoryTombstone | undefined
  list(ownerId: string): PersonalMemory[]
  replace(ownerId: string, id: string, expectedRevision: number, memory: PersonalMemory): void
}

export class MemoryNotFoundError extends Error {
  readonly code = 'MEMORY_NOT_FOUND'

  constructor(readonly memoryId: string) {
    super(`Memory not found: ${memoryId}`)
    this.name = 'MemoryNotFoundError'
  }
}

export class MemoryStateConflictError extends Error {
  readonly code = 'MEMORY_CONFLICT'

  constructor(readonly memoryId: string, message: string) {
    super(message)
    this.name = 'MemoryStateConflictError'
  }
}

export class InMemoryPersonalMemoryStore implements PersonalMemoryStore {
  readonly #records = new Map<string, PersonalMemory>()
  readonly #tombstones = new Map<string, PersonalMemoryTombstone>()

  close(): void {}

  create(memory: PersonalMemory): void {
    const parsed = PersonalMemorySchema.parse(memory)
    const key = memoryKey(parsed.ownerId, parsed.id)
    if (this.#records.has(key) || this.#tombstones.has(key)) {
      throw new MemoryStateConflictError(parsed.id, `Memory id is already in use: ${parsed.id}`)
    }
    this.#records.set(key, parsed)
  }

  get(ownerId: string, id: string): PersonalMemory | undefined {
    return this.#records.get(memoryKey(ownerId, id))
  }

  list(ownerId: string): PersonalMemory[] {
    return [...this.#records.values()]
      .filter(memory => memory.ownerId === ownerId)
      .sort(compareMemories)
  }

  replace(
    ownerId: string,
    id: string,
    expectedRevision: number,
    memory: PersonalMemory,
  ): void {
    const key = memoryKey(ownerId, id)
    const current = this.#records.get(key)
    if (!current) throw new MemoryNotFoundError(id)
    if (current.revision !== expectedRevision) {
      throw new MemoryStateConflictError(id, `Memory revision changed: ${id}`)
    }
    this.#records.set(key, PersonalMemorySchema.parse(memory))
  }

  forget(
    ownerId: string,
    id: string,
    expectedRevision: number,
    tombstone: PersonalMemoryTombstone,
  ): void {
    const key = memoryKey(ownerId, id)
    const current = this.#records.get(key)
    if (!current) throw new MemoryNotFoundError(id)
    if (current.revision !== expectedRevision) {
      throw new MemoryStateConflictError(id, `Memory revision changed: ${id}`)
    }
    this.#records.delete(key)
    this.#tombstones.set(key, PersonalMemoryTombstoneSchema.parse(tombstone))
  }

  getTombstone(ownerId: string, id: string): PersonalMemoryTombstone | undefined {
    return this.#tombstones.get(memoryKey(ownerId, id))
  }
}

export interface SqlitePersonalMemoryStoreOptions {
  filename: string
}

interface MemoryRow {
  allowed_purposes: string
  classification: string
  confidence: number
  confirmed_at: string | null
  content: string
  created_at: string
  id: string
  kind: string
  owner_id: string
  retracted_at: string | null
  revision: number
  scope: string
  source: string
  status: string
  updated_at: string
}

interface TombstoneRow {
  content_digest: string
  erased_at: string
  id: string
  last_revision: number
  owner_id: string
}

export class SqlitePersonalMemoryStore implements PersonalMemoryStore {
  readonly #db: DatabaseSyncType

  constructor(options: SqlitePersonalMemoryStoreOptions) {
    if (options.filename !== ':memory:') {
      mkdirSync(dirname(resolve(options.filename)), { recursive: true })
    }
    this.#db = new DatabaseSync(options.filename)
    try {
      this.#migrate()
    } catch (error) {
      this.#db.close()
      throw error
    }
  }

  close(): void {
    this.#db.close()
  }

  create(memory: PersonalMemory): void {
    const parsed = PersonalMemorySchema.parse(memory)
    this.#transaction(() => {
      if (this.get(parsed.ownerId, parsed.id) || this.getTombstone(parsed.ownerId, parsed.id)) {
        throw new MemoryStateConflictError(parsed.id, `Memory id is already in use: ${parsed.id}`)
      }
      this.#db.prepare(`
        INSERT INTO personal_memories (
          id, owner_id, kind, scope, classification, allowed_purposes, content,
          source, status, confidence, revision, created_at, updated_at,
          confirmed_at, retracted_at
        ) VALUES (
          @id, @ownerId, @kind, @scope, @classification, @allowedPurposes,
          @content, @source, @status, @confidence, @revision, @createdAt,
          @updatedAt, @confirmedAt, @retractedAt
        )
      `).run(toMemoryParameters(parsed))
    })
  }

  get(ownerId: string, id: string): PersonalMemory | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM personal_memories WHERE owner_id = ? AND id = ?
    `).get(ownerId, id) as MemoryRow | undefined
    return row ? mapMemory(row) : undefined
  }

  list(ownerId: string): PersonalMemory[] {
    const rows = this.#db.prepare(`
      SELECT * FROM personal_memories
      WHERE owner_id = ?
      ORDER BY updated_at DESC, id ASC
    `).all(ownerId) as unknown as MemoryRow[]
    return rows.map(mapMemory)
  }

  replace(
    ownerId: string,
    id: string,
    expectedRevision: number,
    memory: PersonalMemory,
  ): void {
    const parsed = PersonalMemorySchema.parse(memory)
    const result = this.#db.prepare(`
      UPDATE personal_memories SET
        kind = @kind,
        scope = @scope,
        classification = @classification,
        allowed_purposes = @allowedPurposes,
        content = @content,
        source = @source,
        status = @status,
        confidence = @confidence,
        revision = @revision,
        updated_at = @updatedAt,
        confirmed_at = @confirmedAt,
        retracted_at = @retractedAt
      WHERE owner_id = @ownerId AND id = @id AND revision = @expectedRevision
    `).run(toMemoryUpdateParameters(parsed, expectedRevision))
    if (result.changes === 0) this.#throwReplaceFailure(ownerId, id)
  }

  forget(
    ownerId: string,
    id: string,
    expectedRevision: number,
    tombstone: PersonalMemoryTombstone,
  ): void {
    const parsed = PersonalMemoryTombstoneSchema.parse(tombstone)
    this.#transaction(() => {
      const result = this.#db.prepare(`
        DELETE FROM personal_memories
        WHERE owner_id = ? AND id = ? AND revision = ?
      `).run(ownerId, id, expectedRevision)
      if (result.changes === 0) this.#throwReplaceFailure(ownerId, id)
      this.#db.prepare(`
        INSERT INTO personal_memory_tombstones (
          id, owner_id, content_digest, last_revision, erased_at
        ) VALUES (@id, @ownerId, @contentDigest, @lastRevision, @erasedAt)
      `).run(parsed)
    })
  }

  getTombstone(ownerId: string, id: string): PersonalMemoryTombstone | undefined {
    const row = this.#db.prepare(`
      SELECT * FROM personal_memory_tombstones WHERE owner_id = ? AND id = ?
    `).get(ownerId, id) as TombstoneRow | undefined
    return row ? mapTombstone(row) : undefined
  }

  #throwReplaceFailure(ownerId: string, id: string): never {
    if (!this.get(ownerId, id)) throw new MemoryNotFoundError(id)
    throw new MemoryStateConflictError(id, `Memory revision changed: ${id}`)
  }

  #migrate(): void {
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS personal_memory_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)
    const row = this.#db.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version FROM personal_memory_migrations
    `).get() as { version: number }
    if (row.version > 1) {
      throw new Error(
        `Personal memory schema version ${row.version} is newer than supported version 1`,
      )
    }
    if (row.version === 1) return

    this.#transaction(() => {
      this.#db.exec(`
        CREATE TABLE personal_memories (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          scope TEXT NOT NULL,
          classification TEXT NOT NULL,
          allowed_purposes TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          confidence REAL NOT NULL,
          revision INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          confirmed_at TEXT,
          retracted_at TEXT
        );

        CREATE INDEX personal_memories_owner_updated_idx
          ON personal_memories(owner_id, updated_at DESC);

        CREATE INDEX personal_memories_retrieval_idx
          ON personal_memories(owner_id, status, scope, classification, updated_at DESC);

        CREATE TABLE personal_memory_tombstones (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          content_digest TEXT NOT NULL,
          last_revision INTEGER NOT NULL,
          erased_at TEXT NOT NULL
        );
      `)
      this.#db.prepare(`
        INSERT INTO personal_memory_migrations (version, name, applied_at)
        VALUES (1, 'personal-memory', ?)
      `).run(new Date().toISOString())
    })
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.#db.exec('COMMIT')
      return result
    } catch (error) {
      this.#db.exec('ROLLBACK')
      throw error
    }
  }
}

export interface MemoryRetrieval {
  maxCharacters?: number
  maxItems?: number
  ownerId: string
  purpose: MemoryPurpose
}

export class PersonalMemoryService {
  constructor(
    private readonly store: PersonalMemoryStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  close(): void {
    this.store.close()
  }

  create(principal: Principal, input: PersonalMemoryCreate): PersonalMemory {
    const parsed = PersonalMemoryCreateSchema.parse(input)
    const timestamp = this.now()
    const memory = PersonalMemorySchema.parse({
      ...parsed,
      confirmedAt: parsed.status === 'confirmed' ? timestamp : null,
      createdAt: timestamp,
      id: createId('memory'),
      ownerId: principal.ownerId,
      retractedAt: null,
      revision: 1,
      updatedAt: timestamp,
    })
    this.store.create(memory)
    return memory
  }

  get(principal: Principal, id: string): PersonalMemory {
    return this.#require(principal.ownerId, id)
  }

  list(
    principal: Principal,
    query: PersonalMemoryListQuery = {},
  ): PersonalMemory[] {
    const parsed = PersonalMemoryListQuerySchema.parse(query)
    return this.store.list(principal.ownerId)
      .filter(memory => !parsed.status || memory.status === parsed.status)
      .filter(memory => !parsed.kind || memory.kind === parsed.kind)
      .filter(memory => !parsed.scope || memory.scope === parsed.scope)
      .filter(memory =>
        !parsed.classification || memory.classification === parsed.classification,
      )
      .slice(0, parsed.limit)
  }

  confirm(principal: Principal, id: string): PersonalMemory {
    const existing = this.#require(principal.ownerId, id)
    if (existing.status !== 'candidate') {
      throw new MemoryStateConflictError(
        id,
        `Memory ${id} is ${existing.status}; expected candidate`,
      )
    }
    const timestamp = this.now()
    return this.#replace(existing, {
      ...existing,
      confirmedAt: timestamp,
      revision: existing.revision + 1,
      status: 'confirmed',
      updatedAt: timestamp,
    })
  }

  correct(
    principal: Principal,
    id: string,
    correction: PersonalMemoryCorrection,
  ): PersonalMemory {
    const existing = this.#require(principal.ownerId, id)
    if (existing.status === 'retracted') {
      throw new MemoryStateConflictError(
        id,
        `Memory ${id} is retracted and cannot be corrected`,
      )
    }
    const parsed = PersonalMemoryCorrectionSchema.parse(correction)
    const timestamp = this.now()
    return this.#replace(existing, {
      ...existing,
      allowedPurposes: parsed.allowedPurposes ?? existing.allowedPurposes,
      classification: parsed.classification ?? existing.classification,
      confidence: parsed.confidence ?? existing.confidence,
      confirmedAt: timestamp,
      content: parsed.content,
      kind: parsed.kind ?? existing.kind,
      retractedAt: null,
      revision: existing.revision + 1,
      scope: parsed.scope ?? existing.scope,
      source: parsed.source,
      status: 'confirmed',
      updatedAt: timestamp,
    })
  }

  retract(principal: Principal, id: string): PersonalMemory {
    const existing = this.#require(principal.ownerId, id)
    if (existing.status === 'retracted') return existing
    const timestamp = this.now()
    return this.#replace(existing, {
      ...existing,
      retractedAt: timestamp,
      revision: existing.revision + 1,
      status: 'retracted',
      updatedAt: timestamp,
    })
  }

  forget(principal: Principal, id: string): PersonalMemoryTombstone {
    const existing = this.#require(principal.ownerId, id)
    const tombstone = PersonalMemoryTombstoneSchema.parse({
      contentDigest: digest(existing.content),
      erasedAt: this.now(),
      id,
      lastRevision: existing.revision,
      ownerId: principal.ownerId,
    })
    this.store.forget(principal.ownerId, id, existing.revision, tombstone)
    return tombstone
  }

  retrieve(input: MemoryRetrieval): PersonalMemory[] {
    const maxItems = input.maxItems ?? 8
    const maxCharacters = input.maxCharacters ?? 6_000
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 32) {
      throw new Error('maxItems must be an integer between 1 and 32')
    }
    if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 20_000) {
      throw new Error('maxCharacters must be an integer between 1 and 20000')
    }
    const scopes = scopesForPurpose(input.purpose)
    const selected: PersonalMemory[] = []
    let characters = 0
    for (const memory of this.store.list(input.ownerId)) {
      if (memory.status !== 'confirmed') continue
      if (memory.classification !== 'public' && memory.classification !== 'personal') continue
      if (!memory.allowedPurposes.includes(input.purpose)) continue
      if (!scopes.has(memory.scope)) continue
      if (characters + memory.content.length > maxCharacters) continue
      selected.push(memory)
      characters += memory.content.length
      if (selected.length === maxItems) break
    }
    return selected
  }

  #require(ownerId: string, id: string): PersonalMemory {
    const memory = this.store.get(ownerId, id)
    if (!memory) throw new MemoryNotFoundError(id)
    return memory
  }

  #replace(existing: PersonalMemory, next: PersonalMemory): PersonalMemory {
    const parsed = PersonalMemorySchema.parse(next)
    this.store.replace(existing.ownerId, existing.id, existing.revision, parsed)
    return parsed
  }
}

function scopesForPurpose(purpose: MemoryPurpose): Set<MemoryScope> {
  const specific: MemoryScope = purpose === 'general_assistance' ? 'general' : purpose
  return new Set(['global', specific])
}

function memoryKey(ownerId: string, id: string): string {
  return `${ownerId}\u0000${id}`
}

function compareMemories(left: PersonalMemory, right: PersonalMemory): number {
  const byUpdated = right.updatedAt.localeCompare(left.updatedAt)
  return byUpdated === 0 ? left.id.localeCompare(right.id) : byUpdated
}

function digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function toMemoryParameters(memory: PersonalMemory) {
  return {
    ...memory,
    allowedPurposes: JSON.stringify(memory.allowedPurposes),
  }
}

function toMemoryUpdateParameters(memory: PersonalMemory, expectedRevision: number) {
  return {
    allowedPurposes: JSON.stringify(memory.allowedPurposes),
    classification: memory.classification,
    confidence: memory.confidence,
    confirmedAt: memory.confirmedAt,
    content: memory.content,
    expectedRevision,
    id: memory.id,
    kind: memory.kind,
    ownerId: memory.ownerId,
    retractedAt: memory.retractedAt,
    revision: memory.revision,
    scope: memory.scope,
    source: memory.source,
    status: memory.status,
    updatedAt: memory.updatedAt,
  }
}

function mapMemory(row: MemoryRow): PersonalMemory {
  return PersonalMemorySchema.parse({
    allowedPurposes: JSON.parse(row.allowed_purposes),
    classification: row.classification,
    confidence: row.confidence,
    confirmedAt: row.confirmed_at,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    ownerId: row.owner_id,
    retractedAt: row.retracted_at,
    revision: row.revision,
    scope: row.scope,
    source: row.source,
    status: row.status,
    updatedAt: row.updated_at,
  })
}

function mapTombstone(row: TombstoneRow): PersonalMemoryTombstone {
  return PersonalMemoryTombstoneSchema.parse({
    contentDigest: row.content_digest,
    erasedAt: row.erased_at,
    id: row.id,
    lastRevision: row.last_revision,
    ownerId: row.owner_id,
  })
}
