import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'adapters/*/src/**/*.ts',
        'apps/*/src/**/*.ts',
        'packages/*/src/**/*.ts',
      ],
      provider: 'v8',
    },
    environment: 'node',
    include: [
      '{adapters,apps,packages}/*/tests/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
})
