import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'adapters/*/src/**/*.ts',
        'apps/*/src/**/*.{ts,tsx}',
        'packages/*/src/**/*.ts',
      ],
      provider: 'v8',
    },
    environment: 'node',
    include: [
      '{adapters,apps,packages}/*/tests/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
    ],
  },
})
