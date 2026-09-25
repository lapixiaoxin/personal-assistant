import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: fileURLToPath(new URL('../../dist/workbench', import.meta.url)),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://127.0.0.1:4310',
      '/v1': 'http://127.0.0.1:4310',
      '/v2': 'http://127.0.0.1:4310',
    },
  },
})
