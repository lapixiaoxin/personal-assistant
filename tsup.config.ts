import { defineConfig } from 'tsup'

export default defineConfig({
  bundle: true,
  clean: true,
  dts: false,
  entry: {
    'cli/main': 'apps/local-runner/src/main.ts',
    'gateway/main': 'apps/gateway/src/main.ts',
    'server/main': 'apps/server/src/main.js',
  },
  esbuildOptions(options) {
    options.supported = {
      ...options.supported,
      'node-colon-prefix-import': true,
    }
  },
  external: ['@deepseek-ai/dsh-sdk-client', '@lumi/dsh-channels-plugin/config', 'node:sqlite'],
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
})
