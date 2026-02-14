import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      aver: resolve(__dirname, '../aver/src/index.ts'),
    },
  },
})
