// PreToolUse approval hooks — tiered permission system for Claude Code agent workers

export type PermissionLevel = 'read_only' | 'edit' | 'full'

export type PromptUser = (message: string) => Promise<boolean>

export interface HookInput {
  hook_event_name: string
  tool_name: string
  tool_input: Record<string, unknown>
  session_id: string
  transcript_path: string
  cwd: string
}

export interface HookResult {
  hookSpecificOutput?: {
    permissionDecision: 'allow' | 'deny' | 'ask_user'
    reason?: string
  }
}

export type HookFn = (
  input: HookInput,
  stdout: unknown,
  context: { signal: AbortSignal },
) => Promise<HookResult>

// --- Tool categories ---

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'])
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

// --- Sensitive Bash patterns (always require user approval) ---

const SENSITIVE_PATTERNS: RegExp[] = [
  /\bgit\s+push\b/,
  /\brm\s+-rf\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+\.\s*$/,
  /\bsudo\b/,
]

// --- Safe Bash patterns (allowed in edit mode) ---

const SAFE_PATTERNS: RegExp[] = [
  /^git\s+status\b/,
  /^git\s+diff\b/,
  /^git\s+log\b/,
  /\bvitest\b/,
  /^pnpm\s+run\s+test\b/,
  /^npm\s+test\b/,
  /^npm\s+run\s+test\b/,
  /^ls\b/,
  /^pwd\b/,
  /^echo\b/,
  /^cat\b/,
  /^pnpm\s+install\b/,
  /^npm\s+install\b/,
]

function isSensitiveCommand(command: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(command))
}

function isSafeCommand(command: string): boolean {
  return SAFE_PATTERNS.some((p) => p.test(command.trim()))
}

function allow(reason?: string): HookResult {
  return { hookSpecificOutput: { permissionDecision: 'allow', reason } }
}

function deny(reason?: string): HookResult {
  return { hookSpecificOutput: { permissionDecision: 'deny', reason } }
}

export function buildApprovalHook(level: PermissionLevel, promptUser: PromptUser): HookFn {
  return async (input: HookInput): Promise<HookResult> => {
    const { tool_name, tool_input } = input

    // Read tools are always allowed at every level
    if (READ_TOOLS.has(tool_name)) {
      return allow(`${tool_name} is a read tool`)
    }

    // Write tools: allowed for edit and full, denied for read_only
    if (WRITE_TOOLS.has(tool_name)) {
      if (level === 'read_only') {
        return deny(`${tool_name} not allowed in read_only mode`)
      }
      return allow(`${tool_name} allowed in ${level} mode`)
    }

    // Task tool: only allowed in full mode
    if (tool_name === 'Task') {
      if (level === 'full') {
        return allow('Task allowed in full mode')
      }
      return deny(`Task not allowed in ${level} mode`)
    }

    // Bash tool: tiered handling
    if (tool_name === 'Bash') {
      const command = (tool_input.command as string) || ''

      // Sensitive commands always require user prompt, regardless of tier
      if (isSensitiveCommand(command)) {
        const approved = await promptUser(
          `Sensitive command requires approval: ${command}`,
        )
        return approved
          ? allow('User approved sensitive command')
          : deny('User denied sensitive command')
      }

      // read_only: deny all Bash
      if (level === 'read_only') {
        return deny('Bash not allowed in read_only mode')
      }

      // edit: allow only safe commands
      if (level === 'edit') {
        if (isSafeCommand(command)) {
          return allow('Safe Bash command allowed in edit mode')
        }
        return deny(`Bash command not in safe list for edit mode: ${command}`)
      }

      // full: allow non-sensitive commands
      return allow('Bash allowed in full mode')
    }

    // Default: deny for read_only, allow for full, deny for edit
    if (level === 'full') {
      return allow(`${tool_name} allowed in full mode`)
    }
    return deny(`${tool_name} not allowed in ${level} mode`)
  }
}
