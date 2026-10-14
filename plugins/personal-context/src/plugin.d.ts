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

export interface LumiPersonalContextConfig {
  readonly ownerId: string
  readonly purpose: PersonalContextPurpose
  readonly snapshotPath: string
}

export interface LumiPersonalContextRuntime {
  readonly systemPrompt: {
    context(input: {
      readonly name: string
      readonly order: number
      readonly text: () => string
    }): () => void
  }
  readonly tools: {
    register(definition: unknown): () => void
  }
  effect(register: () => void | (() => void), label?: string): void
}

export declare const name: 'lumi-personal-context'
export declare const inject: readonly ['systemPrompt', 'tools']

export declare function apply(
  context: LumiPersonalContextRuntime,
  config: LumiPersonalContextConfig,
): void
export declare function computePersonalContextRevision(
  snapshot: Pick<
    PersonalContextSnapshot,
    'entries' | 'ownerId' | 'purpose' | 'schemaVersion'
  >,
): string
export declare function loadPersonalContextSnapshot(
  config: LumiPersonalContextConfig,
): PersonalContextSnapshot
export declare function renderPersonalContext(
  snapshot: PersonalContextSnapshot,
): string
export declare function resolveConfig(input: unknown): Readonly<LumiPersonalContextConfig>
