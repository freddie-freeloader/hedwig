import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const relay = 'http://127.0.0.1:4747'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
    proxy: {
      '/v1': { target: relay, changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:4747', ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
})
