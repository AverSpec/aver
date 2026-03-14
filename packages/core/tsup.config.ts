import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.preset'

export default defineConfig([
  {
    ...baseConfig,
    entry: {
      index: 'src/index.ts',
      internals: 'src/internals.ts',
      reporter: 'src/reporter/junit.ts',
      scaffold: 'src/cli/scaffold.ts',
    },
    splitting: true,
    shims: true,
    external: ['vitest'],
  },
  {
    ...baseConfig,
    entry: {
      cli: 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    splitting: true,
    shims: true,
    external: ['vitest', '@aver/telemetry'],
  },
])
