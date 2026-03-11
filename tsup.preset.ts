import type { Options } from 'tsup'

/**
 * Shared tsup base config for all Aver packages.
 * Spread into your package config and override as needed.
 */
export const baseConfig: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
}
