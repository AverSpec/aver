import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/core',
  'packages/approvals',
  'packages/mcp-server',
  'packages/protocol-http',
  'packages/protocol-playwright',
  'packages/workspace',
  'examples/task-board',
])
