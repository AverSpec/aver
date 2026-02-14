import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/aver',
  'packages/approvals',
  'packages/mcp-server',
  'packages/protocol-playwright',
  'examples/task-board',
])
