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
      '@averspec/core/internals': resolve(__dirname, '../core/src/internals.ts'),
      '@averspec/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
})
