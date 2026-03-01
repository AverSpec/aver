import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    root: __dirname,
    include: ['test/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@aver/core': resolve(__dirname, '../core/src/index.ts'),
      '@aver/approvals': resolve(__dirname, '../approvals/src/index.ts'),
    },
  },
})
