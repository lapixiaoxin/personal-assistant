import { describe, expect, it } from 'vitest'
import { InMemoryPersonalMemoryStore, PersonalMemoryService } from '../src/index.ts'

describe('PersonalMemoryService', () => {
  it('keeps inferred memories as candidates until explicitly confirmed', () => {
    const store = new InMemoryPersonalMemoryStore()
    const service = new PersonalMemoryService(store, () => '2026-09-24T10:00:00.000Z')

    const candidate = service.recordCandidate({
      confidence: 0.8,
      content: 'Prefers direct decision rules',
      kind: 'preference',
      ownerId: 'user-1',
      scope: 'engineering',
      source: 'explicit user feedback',
    })

    expect(candidate.status).toBe('candidate')
    expect(service.confirm(candidate.id).status).toBe('confirmed')
    expect(service.retract(candidate.id).status).toBe('retracted')
  })
})
