import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    root: __dirname,
    include: ['test/eval/**/*.eval.ts'],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@aver/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
})
