import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    env: {
      // Tests that exercise domain discovery and config loading need this gate
      // enabled. Individual tests in trust.spec.ts override it per-test.
      AVER_TRUST_PROJECT: '1',
    },
  },
  resolve: {
    alias: {
      '@aver/workspace': resolve(__dirname, '../workspace/src/index.ts'),
      '@aver/core/scaffold': resolve(__dirname, '../core/src/cli/scaffold.ts'),
    },
  },
})
