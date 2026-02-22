import { describe, it, expect, vi } from 'vitest'
import { buildApprovalHook } from '../../src/shell/hooks.js'

function hookInput(toolName: string, toolInput: Record<string, unknown> = {}): any {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    session_id: '',
    transcript_path: '',
    cwd: '',
  }
}

const ctx = { signal: new AbortController().signal }

describe('buildApprovalHook', () => {
  describe('read_only', () => {
    it('allows Read', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Read'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Glob', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Glob'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Grep', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Grep'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('denies Edit', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Edit'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('denies Write', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Write'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('denies Bash', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Bash', { command: 'ls' }), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('denies Task', async () => {
      const hook = buildApprovalHook('read_only', async () => true)
      const result = await hook(hookInput('Task'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })
  })

  describe('edit', () => {
    it('allows Read', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Read'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Edit', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Edit'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Write', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Write'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows NotebookEdit', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('NotebookEdit'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows safe Bash commands like vitest', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Bash', { command: 'pnpm exec vitest run' }), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows git status', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Bash', { command: 'git status' }), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('denies arbitrary Bash commands', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Bash', { command: 'curl http://example.com' }), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('denies Task', async () => {
      const hook = buildApprovalHook('edit', async () => true)
      const result = await hook(hookInput('Task'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })
  })

  describe('full', () => {
    it('allows Read', async () => {
      const hook = buildApprovalHook('full', async () => true)
      const result = await hook(hookInput('Read'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Edit', async () => {
      const hook = buildApprovalHook('full', async () => true)
      const result = await hook(hookInput('Edit'), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('allows Bash', async () => {
      const hook = buildApprovalHook('full', async () => true)
      const result = await hook(hookInput('Bash', { command: 'node build.js' }), undefined, ctx)
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('prompts user for git push', async () => {
      const promptUser = vi.fn().mockResolvedValue(true)
      const hook = buildApprovalHook('full', promptUser)
      const result = await hook(hookInput('Bash', { command: 'git push origin main' }), undefined, ctx)
      expect(promptUser).toHaveBeenCalled()
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow')
    })

    it('denies git push when user declines', async () => {
      const promptUser = vi.fn().mockResolvedValue(false)
      const hook = buildApprovalHook('full', promptUser)
      const result = await hook(hookInput('Bash', { command: 'git push origin main' }), undefined, ctx)
      expect(promptUser).toHaveBeenCalled()
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('prompts user for rm -rf', async () => {
      const promptUser = vi.fn().mockResolvedValue(true)
      const hook = buildApprovalHook('full', promptUser)
      await hook(hookInput('Bash', { command: 'rm -rf /tmp/stuff' }), undefined, ctx)
      expect(promptUser).toHaveBeenCalled()
    })

    it('prompts user for sudo commands', async () => {
      const promptUser = vi.fn().mockResolvedValue(false)
      const hook = buildApprovalHook('full', promptUser)
      const result = await hook(hookInput('Bash', { command: 'sudo apt install foo' }), undefined, ctx)
      expect(promptUser).toHaveBeenCalled()
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny')
    })

    it('prompts user for git reset --hard', async () => {
      const promptUser = vi.fn().mockResolvedValue(true)
      const hook = buildApprovalHook('full', promptUser)
      await hook(hookInput('Bash', { command: 'git reset --hard HEAD~1' }), undefined, ctx)
      expect(promptUser).toHaveBeenCalled()
    })
  })
})
