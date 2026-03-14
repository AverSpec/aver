import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.preset'

export default defineConfig([
  {
    ...baseConfig,
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    external: ['@averspec/core'],
  },
  {
    ...baseConfig,
    entry: { vitest: 'src/vitest-plugin.ts' },
    format: ['esm'],
    external: ['@averspec/core', '@averspec/core/internals', 'vitest'],
  },
])
