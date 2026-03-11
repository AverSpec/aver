import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.preset'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  external: ['@aver/core'],
})
