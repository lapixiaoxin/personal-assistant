import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'apps/*/src/**/*.{js,ts}',
        'channels/*/src/**/*.{js,ts}',
        'packages/*/src/**/*.{js,ts}',
        'plugins/*/src/**/*.{js,ts}',
      ],
      provider: 'v8',
    },
    environment: 'node',
    include: [
      '{apps,packages,plugins,channels}/*/tests/**/*.test.{js,ts}',
      'tests/**/*.test.{js,ts}',
    ],
  },
})
