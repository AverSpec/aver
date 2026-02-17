import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/core',
  'packages/approvals',
  'packages/mcp-server',
  'packages/protocol-playwright',
  'examples/task-board',
])
