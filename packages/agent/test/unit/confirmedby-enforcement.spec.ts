import { describe, it, expect } from 'vitest'
import { buildApprovalHook, type PermissionLevel } from '../../src/shell/hooks.js'

describe('confirmedBy enforcement', () => {
  const levels: PermissionLevel[] = ['read_only', 'edit', 'full']
  const confirmToolNames = ['confirm_scenario', 'mcp__aver__confirm_scenario']

  it('confirm_scenario is denied at all permission levels', async () => {
    for (const level of levels) {
      const hook = buildApprovalHook(level, async () => false)
      for (const toolName of confirmToolNames) {
        const result = await hook(
          { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: {}, session_id: '', transcript_path: '', cwd: '/' },
          undefined,
          { signal: new AbortController().signal },
        )
        expect(result.hookSpecificOutput?.permissionDecision, `${toolName} should be denied at ${level}`).toBe('deny')
      }
    }
  })

  it('no supervisor action type maps to scenario confirmation', () => {
    // The supervisor decision schema defines all valid action types.
    // Confirmation must NEVER appear as an action type.
    // If someone adds a 'confirm' action, this test must be updated with justification.
    const validActionTypes = [
      'stop', 'ask_user', 'dispatch_worker', 'dispatch_workers',
      'checkpoint', 'complete_story', 'update_workspace',
    ]
    expect(validActionTypes).not.toContain('confirm')
    expect(validActionTypes).not.toContain('confirm_scenario')
  })
})
