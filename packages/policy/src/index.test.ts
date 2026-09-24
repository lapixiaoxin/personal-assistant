import { describe, expect, it } from 'vitest'
import { createTaskRequest, type CapabilityDescriptor } from '@personal-assistant/contracts'
import { DefaultPolicyEngine } from './index.ts'

const readCapability: CapabilityDescriptor = {
  description: 'General assistant',
  id: 'assistant',
  kind: 'agent',
  operations: ['answer'],
  riskLevel: 'read',
}

describe('DefaultPolicyEngine', () => {
  const policy = new DefaultPolicyEngine()

  it('allows read-only work', () => {
    const decision = policy.evaluate(createTaskRequest({
      actorId: 'user-1',
      channel: 'test',
      content: 'Summarize this document',
    }), readCapability)

    expect(decision.action).toBe('allow')
    expect(decision.riskLevel).toBe('read')
  })

  it('requires approval for external communication', () => {
    const decision = policy.evaluate(createTaskRequest({
      actorId: 'user-1',
      channel: 'test',
      content: 'Send this summary by email',
    }), readCapability)

    expect(decision).toMatchObject({
      action: 'require_approval',
      riskLevel: 'external',
      ruleId: 'content.external-side-effect',
    })
  })

  it('requires approval for destructive operations', () => {
    const decision = policy.evaluate(createTaskRequest({
      actorId: 'user-1',
      channel: 'test',
      content: '删除旧文件',
    }), readCapability)

    expect(decision).toMatchObject({
      action: 'require_approval',
      riskLevel: 'critical',
    })
  })
})
