export type PersonalContextPurpose =
  | 'coding'
  | 'general_assistance'
  | 'meeting'
  | 'research'

export interface PersonalContextEntry {
  readonly content: string
  readonly id: string
  readonly kind: 'experience' | 'fact' | 'preference' | 'relationship'
  readonly revision: number
  readonly scope: 'coding' | 'general' | 'global' | 'meeting' | 'research'
  readonly source: string
}

export interface PersonalContextSnapshot {
  readonly entries: readonly PersonalContextEntry[]
  readonly generatedAt: string
  readonly ownerId: string
  readonly purpose: PersonalContextPurpose
  readonly revision: string
  readonly schemaVersion: 'lumi.personal-context/v1'
}

export interface PersonalContextExpectations {
  readonly ownerId?: string
  readonly purpose?: PersonalContextPurpose
}

export declare function parsePersonalContextSnapshot(
  input: unknown,
  expectations?: PersonalContextExpectations,
): PersonalContextSnapshot

export declare function computePersonalContextRevision(
  snapshot: Pick<
    PersonalContextSnapshot,
    'entries' | 'ownerId' | 'purpose' | 'schemaVersion'
  >,
): string

export declare function renderPersonalContext(
  snapshot: PersonalContextSnapshot,
): string
