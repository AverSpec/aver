import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.preset'

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/index.ts',
    vitest: 'src/vitest-plugin.ts',
  },
  format: ['esm'],
  external: ['@aver/core', '@aver/core/internals', 'vitest'],
})
