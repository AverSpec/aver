import type { Adapter } from './adapter'
import { registerAdapter } from './registry'

export interface AverConfig {
  testDir: string
  adapters: Adapter[]
}

export interface AverConfigInput {
  testDir?: string
  adapters: Adapter[]
}

export function defineConfig(input: AverConfigInput): AverConfig {
  for (const adapter of input.adapters) {
    registerAdapter(adapter)
  }

  return {
    testDir: input.testDir ?? './tests/acceptance',
    adapters: input.adapters,
  }
}
