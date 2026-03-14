import { defineConfig } from 'vitest/config'
import { averReporter } from '@averspec/core/reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: true,
    testTimeout: 60000,
    setupFiles: ['./aver.config.ts', '@averspec/telemetry/vitest'],
    reporters: [
      'default',
      averReporter({ output: 'test-results/example-task-board.xml' }),
    ],
  },
})
