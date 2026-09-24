import type { CapabilityDescriptor, TaskRequest } from '@lumi/contracts'
import { CapabilityDescriptorSchema } from '@lumi/contracts'

export interface RoutingDecision {
  capability: CapabilityDescriptor
  reason: string
}

export interface TaskRouter {
  route(request: TaskRequest): RoutingDecision
}

export class CapabilityRegistry {
  readonly #capabilities = new Map<string, CapabilityDescriptor>()

  register(descriptor: CapabilityDescriptor): void {
    const parsed = CapabilityDescriptorSchema.parse(descriptor)
    if (this.#capabilities.has(parsed.id)) {
      throw new Error(`Capability already registered: ${parsed.id}`)
    }
    this.#capabilities.set(parsed.id, Object.freeze(parsed))
  }

  get(id: string): CapabilityDescriptor | undefined {
    return this.#capabilities.get(id)
  }

  require(id: string): CapabilityDescriptor {
    const capability = this.get(id)
    if (!capability) {
      throw new Error(`Capability is not registered: ${id}`)
    }
    return capability
  }

  list(): CapabilityDescriptor[] {
    return [...this.#capabilities.values()]
  }
}

const CODING_INTENT =
  /\b(code|coding|repository|repo|commit|pull request|typescript|javascript|python|golang|rust|java|debug|test|refactor|implement|fix)\b|代码|编码|仓库|单测|测试|调试|重构|实现|修复|提交/i

export class RuleBasedRouter implements TaskRouter {
  constructor(private readonly registry: CapabilityRegistry) {}

  route(request: TaskRequest): RoutingDecision {
    if (CODING_INTENT.test(request.content)) {
      return {
        capability: this.registry.require('coding-agent'),
        reason: 'Matched an explicit software-engineering intent.',
      }
    }

    return {
      capability: this.registry.require('personal-assistant'),
      reason: 'No specialist rule matched; use the general personal assistant.',
    }
  }
}

export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register({
    description: 'Answers, summarizes, researches, and coordinates personal tasks.',
    id: 'personal-assistant',
    kind: 'agent',
    operations: ['answer', 'summarize', 'research', 'coordinate'],
    riskLevel: 'read',
  })
  registry.register({
    description: 'Handles repository analysis, implementation, testing, and code maintenance.',
    id: 'coding-agent',
    kind: 'agent',
    operations: ['analyze_code', 'edit_code', 'run_tests', 'summarize_changes'],
    riskLevel: 'write',
  })
  return registry
}
