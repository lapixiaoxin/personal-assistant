import type {
  ActionProposal,
  CapabilityDescriptor,
  Principal,
  RiskLevel,
  TaskRequest,
} from '@lumi/contracts'

export type PolicyAction = 'allow' | 'require_approval' | 'deny'

export interface PolicyDecision {
  action: PolicyAction
  reason: string
  riskLevel: RiskLevel
  ruleId: string
}

export interface PolicyEngine {
  evaluate(request: TaskRequest, capability: CapabilityDescriptor): PolicyDecision
}

export interface ActionPolicyDecision {
  action: PolicyAction
  policyVersion: string
  reason: string
  riskLevel: RiskLevel
  ruleId: string
}

export interface ActionPolicyEngine {
  evaluateAction(
    principal: Principal,
    proposal: ActionProposal,
    now: string,
  ): ActionPolicyDecision
}

const RISK_WEIGHT: Record<RiskLevel, number> = {
  read: 0,
  write: 1,
  external: 2,
  critical: 3,
}

const CRITICAL_INTENT =
  /\b(pay|purchase|buy|transfer money|delete|erase|unlock|factory reset|shutdown device)\b|支付|付款|购买|转账|删除|清空|开锁|恢复出厂|关闭设备/i
const EXTERNAL_INTENT =
  /\b(send|publish|post|email|message|invite|submit)\b|发送|发布|发邮件|发消息|邀请|对外提交/i

function greaterRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  return RISK_WEIGHT[left] >= RISK_WEIGHT[right] ? left : right
}

function inferContentRisk(content: string): { level: RiskLevel; ruleId: string } {
  if (CRITICAL_INTENT.test(content)) {
    return { level: 'critical', ruleId: 'content.critical-operation' }
  }
  if (EXTERNAL_INTENT.test(content)) {
    return { level: 'external', ruleId: 'content.external-side-effect' }
  }
  return { level: 'read', ruleId: 'content.no-sensitive-operation' }
}

export class DefaultPolicyEngine implements PolicyEngine {
  evaluate(request: TaskRequest, capability: CapabilityDescriptor): PolicyDecision {
    const contentRisk = inferContentRisk(request.content)
    const riskLevel = greaterRisk(capability.riskLevel, contentRisk.level)

    if (riskLevel === 'external' || riskLevel === 'critical') {
      return {
        action: 'require_approval',
        reason: `Explicit approval is required for ${riskLevel} operations.`,
        riskLevel,
        ruleId: contentRisk.level === riskLevel ? contentRisk.ruleId : 'capability.risk-level',
      }
    }

    return {
      action: 'allow',
      reason: `The ${riskLevel} operation is allowed by the MVP policy.`,
      riskLevel,
      ruleId: 'risk.allow-read-write',
    }
  }
}

export class DefaultActionPolicyEngine implements ActionPolicyEngine {
  evaluateAction(
    principal: Principal,
    proposal: ActionProposal,
    now: string,
  ): ActionPolicyDecision {
    if (principal.kind !== 'owner') {
      return denyAction('identity.owner-required', 'Only the configured owner may authorize actions.')
    }
    if (proposal.operation !== 'artifact.write') {
      return denyAction('operation.unsupported', 'The requested operation is not enabled.')
    }
    if (
      proposal.capability.id !== 'local-artifact'
      || proposal.capability.version !== '1.0.0'
    ) {
      return denyAction(
        'capability.incompatible',
        'The requested capability version is not enabled.',
      )
    }
    if (proposal.deadline && Date.parse(proposal.deadline) <= Date.parse(now)) {
      return denyAction('deadline.expired', 'The action deadline has expired.')
    }

    return {
      action: 'require_approval',
      policyVersion: 'local-action-policy/1',
      reason: 'Approval is required for this concrete local artifact write.',
      riskLevel: 'write',
      ruleId: 'artifact.write.confirm',
    }
  }
}

function denyAction(ruleId: string, reason: string): ActionPolicyDecision {
  return {
    action: 'deny',
    policyVersion: 'local-action-policy/1',
    reason,
    riskLevel: 'write',
    ruleId,
  }
}
