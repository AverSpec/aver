import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', tui: 'src/tui/index.tsx' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@aver/core', '@anthropic-ai/claude-agent-sdk', 'ink', 'react', '@inkjs/ui', 'ink-text-input', 'zod'],
})
