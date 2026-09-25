export interface BridgeConnection {
  readonly token: string
  readonly url: string
}

export interface BridgeEnvironment {
  readonly LUMI_ACTION_BRIDGE_TOKEN?: string
  readonly LUMI_ACTION_BRIDGE_URL?: string
  readonly [key: string]: string | undefined
}

export interface BridgeToolExecution {
  readonly signal: AbortSignal
}

export interface BridgeToolDefinition {
  readonly name: string
  execute(
    args: Record<string, string | undefined>,
    execution: BridgeToolExecution,
  ): Promise<string>
}

export interface BridgeToolRuntime {
  guard(callback: (execution: { readonly name: string }) => string | undefined): () => void
  register(definition: BridgeToolDefinition): () => void
}

export interface BridgeContext {
  readonly tools: BridgeToolRuntime
}

export declare const name: 'lumi-action-bridge'
export declare const inject: readonly ['tools']
export declare const allowedToolNames: readonly string[]

export declare function apply(context: BridgeContext): Promise<void>
export declare function resolveBridgeEnvironment(environment: BridgeEnvironment): BridgeConnection
export declare function toolGuardReason(toolName: string): string | undefined
