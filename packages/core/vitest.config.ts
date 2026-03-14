import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@averspec/approvals': resolve(__dirname, '../approvals/src/index.ts'),
    },
  },
})
