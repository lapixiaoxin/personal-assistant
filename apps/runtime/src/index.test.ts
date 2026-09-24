import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistantRuntime, resolveDshModelConfiguration } from './index.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runtime composition', () => {
  it('uses DSH by default without starting it eagerly', async () => {
    vi.stubEnv('PA_EXECUTOR', undefined)
    const runtime = createAssistantRuntime({ dbPath: ':memory:' })

    expect(runtime.executorKind).toBe('dsh')
    await runtime.close()
  })

  it('requires an explicit switch to use the mock executor', async () => {
    vi.stubEnv('PA_EXECUTOR', 'mock')
    const runtime = createAssistantRuntime({ dbPath: ':memory:' })

    expect(runtime.executorKind).toBe('mock')
    await runtime.close()
  })

  it('selects the matching built-in MiniMax catalog from the available key', () => {
    expect(resolveDshModelConfiguration({
      MINIMAX_CN_API_KEY: 'redacted',
    })).toEqual({
      model: 'MiniMax-M3',
      provider: 'minimax-cn',
      providerPatchFiles: ['profiles/providers/minimax-cn.patch.yml'],
    })
    expect(resolveDshModelConfiguration({
      MINIMAX_API_KEY: 'redacted',
    })).toEqual({
      model: 'MiniMax-M3',
      provider: 'minimax',
      providerPatchFiles: ['profiles/providers/minimax.patch.yml'],
    })
  })
})
