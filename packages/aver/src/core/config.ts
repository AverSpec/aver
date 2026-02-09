import type { Adapter } from './adapter'

export interface AverConfig {
  testDir: string
  adapters: Adapter[]
}

export interface AverConfigInput {
  testDir?: string
  adapters: Adapter[]
}

export function defineConfig(input: AverConfigInput): AverConfig {
  return {
    testDir: input.testDir ?? './tests/acceptance',
    adapters: input.adapters,
  }
}
