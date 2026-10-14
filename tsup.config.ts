import { defineConfig } from 'tsup'

export default defineConfig({
  bundle: true,
  dts: false,
  entry: {
    'server/main': 'host/src/main.js',
  },
  esbuildOptions(options) {
    options.supported = {
      ...options.supported,
      'node-colon-prefix-import': true,
    }
  },
  external: ['@deepseek-ai/dsh-sdk-client', '@lumi/host/config'],
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
  splitting: false,
  target: 'node22',
})
