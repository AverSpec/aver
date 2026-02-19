import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/approvals',
      'packages/mcp-server',
      'packages/protocol-http',
      'packages/protocol-playwright',
      'packages/workspace',
      'packages/agent',
      'examples/task-board',
    ],
    exclude: ['.worktrees/**'],
  },
})
