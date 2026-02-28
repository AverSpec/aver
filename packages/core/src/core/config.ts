import type { Adapter } from './adapter'
import { registerAdapter } from './registry'

export interface CoverageConfig {
  minPercentage: number
}

export interface AverConfig {
  testDir: string
  adapters: Adapter[]
  coverage: CoverageConfig
}

export interface AverConfigInput {
  testDir?: string
  adapters: Adapter[]
  coverage?: {
    minPercentage?: number
  }
}

let coverageConfig: CoverageConfig = { minPercentage: 0 }

export function getCoverageConfig(): CoverageConfig {
  return coverageConfig
}

/** @internal — resets module-level state between tests */
export function resetCoverageConfig(): void {
  coverageConfig = { minPercentage: 0 }
}

export function defineConfig(input: AverConfigInput): AverConfig {
  for (const adapter of input.adapters) {
    registerAdapter(adapter)
  }

  const minPct = input.coverage?.minPercentage ?? 0
  if (typeof minPct !== 'number' || minPct < 0 || minPct > 100) {
    throw new Error(`coverage.minPercentage must be a number between 0 and 100, got ${minPct}`)
  }
  coverageConfig = {
    minPercentage: minPct,
  }

  return {
    testDir: input.testDir ?? './tests/acceptance',
    adapters: input.adapters,
    coverage: coverageConfig,
  }
}
