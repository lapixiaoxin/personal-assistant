import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'channels/*/src/**/*.{js,ts}',
        'host/src/**/*.{js,ts}',
        'plugins/*/src/**/*.{js,ts}',
      ],
      provider: 'v8',
    },
    environment: 'node',
    include: [
      '{channels,plugins}/*/tests/**/*.test.{js,ts}',
      'host/tests/**/*.test.{js,ts}',
      'tests/**/*.test.{js,ts}',
    ],
  },
})
