import type { ActionRecord } from '@lumi/contracts'

export type ArtifactProviderErrorCode = 'CONFLICT' | 'INVALID_INPUT'

export interface ArtifactObservation {
  artifactRef: string
  contentDigest: string | null
  exists: boolean
}

export interface ArtifactWriteResult {
  artifactRef: string
  contentDigest: string
  providerVersion: string
}

export interface ArtifactProvider {
  read(action: ActionRecord): Promise<ArtifactObservation>
  write(action: ActionRecord, content: string): Promise<ArtifactWriteResult>
}

export function artifactProviderErrorCode(error: unknown): ArtifactProviderErrorCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = Reflect.get(error, 'code')
  return code === 'CONFLICT' || code === 'INVALID_INPUT' ? code : undefined
}
