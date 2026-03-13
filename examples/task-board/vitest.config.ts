import { defineConfig } from 'vitest/config'
import { averReporter } from '@aver/core/reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: true,
    testTimeout: 60000,
    setupFiles: ['./aver.config.ts', '@aver/telemetry/vitest'],
    reporters: [
      'default',
      averReporter({ output: 'test-results/example-task-board.xml' }),
    ],
  },
})
