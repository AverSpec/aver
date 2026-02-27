import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@aver/agent': resolve(__dirname, '../agent/src/index.ts'),
      '@aver/core/scaffold': resolve(__dirname, '../core/src/cli/scaffold.ts'),
    },
  },
})
