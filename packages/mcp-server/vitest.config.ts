import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@aver/workspace': resolve(__dirname, '../workspace/src/index.ts'),
      '@aver/core/scaffold': resolve(__dirname, '../core/src/cli/scaffold.ts'),
    },
  },
})
