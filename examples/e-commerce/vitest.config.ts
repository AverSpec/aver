import { defineConfig } from 'vitest/config'
import { averReporter } from 'aver/reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: true,
    testTimeout: 30000,
    reporters: [
      'default',
      averReporter({ output: 'test-results/example-task-board.xml' }),
    ],
  },
})
