import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    root: __dirname,
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
  },
  resolve: {
    alias: {
      '@aver/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
})
