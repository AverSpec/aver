import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      internals: 'src/internals.ts',
      reporter: 'src/reporter/junit.ts',
      scaffold: 'src/cli/scaffold.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    shims: true,
    external: ['vitest'],
  },
  {
    entry: {
      cli: 'src/cli/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    sourcemap: true,
    splitting: true,
    shims: true,
    external: ['vitest', '@aver/agent'],
  },
])
