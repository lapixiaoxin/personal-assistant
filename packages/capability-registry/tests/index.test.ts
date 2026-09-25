import { describe, expect, it } from 'vitest'
import { createTaskRequest } from '@lumi/contracts'
import {
  createDefaultCapabilityRegistry,
  RuleBasedRouter,
} from '../src/index.ts'

describe('capability routing', () => {
  const router = new RuleBasedRouter(createDefaultCapabilityRegistry())

  it('routes an explicit research workflow before content heuristics', () => {
    const decision = router.route(createTaskRequest({
      actorId: 'owner',
      channel: 'research-brief',
      content: 'Compare implementation approaches in these sources',
      contextRefs: ['lumi-workflow:research-brief/v1'],
    }))

    expect(decision).toMatchObject({
      capability: { id: 'research-agent' },
      reason: 'Matched the explicit research brief workflow marker.',
    })
  })

  it('routes an explicit meeting workflow before coding content heuristics', () => {
    const decision = router.route(createTaskRequest({
      actorId: 'owner',
      channel: 'meeting-brief',
      content: 'Review the TypeScript implementation in the planning meeting',
      contextRefs: ['lumi-workflow:meeting-brief/v1'],
    }))

    expect(decision).toMatchObject({
      capability: { id: 'meeting-agent' },
      reason: 'Matched the explicit meeting brief workflow marker.',
    })
  })

  it('keeps free-form coding and personal routing compatible', () => {
    expect(router.route(createTaskRequest({
      actorId: 'owner',
      channel: 'test',
      content: 'Implement a parser',
    })).capability.id).toBe('coding-agent')
    expect(router.route(createTaskRequest({
      actorId: 'owner',
      channel: 'test',
      content: 'Summarize my day',
    })).capability.id).toBe('personal-assistant')
  })
})
