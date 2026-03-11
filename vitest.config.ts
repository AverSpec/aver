import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/approvals',
      'packages/telemetry',
      'packages/protocol-http',
      'packages/protocol-playwright',
      'examples/task-board',
    ],
    exclude: ['.worktrees/**'],
  },
})
