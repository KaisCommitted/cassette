import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Vitest reads this file, not electron.vite.config.ts. Keep the @shared alias
// in sync with the one in electron.vite.config.ts.
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(process.cwd(), 'src/shared') }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
