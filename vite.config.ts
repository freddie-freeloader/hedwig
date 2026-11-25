import tailwindcss from '@tailwindcss/vite'
import elmPlugin from 'vite-plugin-elm'
import { defineConfig } from 'vitest/config'

const pagesRepository = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base =
  process.env.GITHUB_PAGES === 'true' && pagesRepository
    ? `/${pagesRepository}/`
    : '/'

export default defineConfig({
  base,
  plugins: [elmPlugin(), tailwindcss()],
  build: {
    target: 'es2020',
  },
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
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
