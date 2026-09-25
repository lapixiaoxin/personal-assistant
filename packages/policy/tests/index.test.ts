import { describe, expect, it } from 'vitest'
import {
  ActionProposalSubmissionSchema,
  createTaskRequest,
  type CapabilityDescriptor,
  type Principal,
} from '@lumi/contracts'
import { DefaultActionPolicyEngine, DefaultPolicyEngine } from '../src/index.ts'

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

describe('DefaultActionPolicyEngine', () => {
  const policy = new DefaultActionPolicyEngine()
  const principal: Principal = {
    authStrength: 'local_process',
    id: 'principal-1',
    kind: 'owner',
    ownerId: 'owner-1',
  }

  it('requires confirmation for a concrete artifact write', () => {
    const proposal = ActionProposalSubmissionSchema.parse({
      content: 'content',
      idempotencyKey: 'artifact-1',
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId: 'summary' },
    })

    expect(policy.evaluateAction(
      principal,
      proposal,
      '2026-09-25T10:00:00.000Z',
    )).toMatchObject({
      action: 'require_approval',
      policyVersion: 'local-action-policy/1',
      ruleId: 'artifact.write.confirm',
    })
  })

  it('denies expired proposals before authorization', () => {
    const proposal = ActionProposalSubmissionSchema.parse({
      content: 'content',
      deadline: '2026-09-25T09:59:59.000Z',
      idempotencyKey: 'artifact-expired',
      operation: 'artifact.write',
      schemaVersion: 'lumi.action-proposal/v1',
      target: { artifactId: 'summary' },
    })

    expect(policy.evaluateAction(
      principal,
      proposal,
      '2026-09-25T10:00:00.000Z',
    )).toMatchObject({
      action: 'deny',
      ruleId: 'deadline.expired',
    })
  })
})
