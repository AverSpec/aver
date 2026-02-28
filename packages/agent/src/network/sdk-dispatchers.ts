import { query } from '@anthropic-ai/claude-agent-sdk'
import { withAbort } from './with-abort.js'

const DEFAULT_SUPERVISOR_TURN_MS = 30_000
const DEFAULT_SUPERVISOR_TOTAL_MS = 120_000
const DEFAULT_WORKER_TURN_MS = 180_000
const DEFAULT_WORKER_TOTAL_MS = 1_800_000

export interface SdkDispatcherConfig {
  claudeExecutablePath?: string
  supervisorModel?: string
  workerModel?: string
  maxWorkerTurns?: number
  timeouts?: {
    supervisorTurnMs?: number
    supervisorTotalMs?: number
    workerTurnMs?: number
    workerTotalMs?: number
  }
}

interface DispatchResult {
  response: string
  tokenUsage: number
}

/**
 * Create real SDK dispatchers that call Claude via the Agent SDK.
 *
 * Both dispatchers are thin wrappers: they take (systemPrompt, userPrompt),
 * call query(), collect the response text, and return (response, tokenUsage).
 * AgentNetwork owns all prompt building.
 */
export function createSdkDispatchers(config: SdkDispatcherConfig) {
  const baseOptions = {
    ...(config.claudeExecutablePath && { pathToClaudeCodeExecutable: config.claudeExecutablePath }),
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
  }

  async function dispatch(
    systemPrompt: string,
    userPrompt: string,
    options: {
      model?: string
      maxTurns: number
      turnTimeoutMs: number
      totalTimeoutMs: number
      disallowedTools?: string[]
    },
  ): Promise<DispatchResult> {
    const totalController = new AbortController()
    const totalTimer = setTimeout(
      () => totalController.abort(new Error(`Dispatch exceeded total timeout of ${options.totalTimeoutMs}ms`)),
      options.totalTimeoutMs,
    )

    let assistantText = ''
    let tokenUsage = 0

    try {
      const q = query({
        prompt: userPrompt,
        options: {
          ...baseOptions,
          systemPrompt,
          model: options.model,
          maxTurns: options.maxTurns,
          persistSession: false,
          ...(options.disallowedTools && { disallowedTools: options.disallowedTools }),
        },
      })

      for await (const message of withAbort(q, totalController.signal, options.turnTimeoutMs)) {
        if (message.type === 'assistant') {
          for (const block of (message as any).message.content) {
            if (block.type === 'text') {
              assistantText += block.text
            }
          }
        }
        if (message.type === 'result' && (message as any).subtype === 'success') {
          tokenUsage = (message as any).usage.input_tokens + (message as any).usage.output_tokens
        }
        if (message.type === 'result' && (message as any).subtype !== 'success') {
          const errors = 'errors' in (message as any) && Array.isArray((message as any).errors)
            ? (message as any).errors
            : []
          throw new Error(`SDK dispatch failed: ${errors.join('; ') || (message as any).subtype}`)
        }
      }
    } finally {
      clearTimeout(totalTimer)
    }

    return { response: assistantText, tokenUsage }
  }

  const supervisorTurnMs = config.timeouts?.supervisorTurnMs ?? DEFAULT_SUPERVISOR_TURN_MS
  const supervisorTotalMs = config.timeouts?.supervisorTotalMs ?? DEFAULT_SUPERVISOR_TOTAL_MS
  const workerTurnMs = config.timeouts?.workerTurnMs ?? DEFAULT_WORKER_TURN_MS
  const workerTotalMs = config.timeouts?.workerTotalMs ?? DEFAULT_WORKER_TOTAL_MS

  // Supervisor: no tools, maxTurns 2 (structured output pattern)
  const ALL_TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'Task', 'NotebookEdit', 'WebFetch', 'WebSearch']

  return {
    supervisorDispatch: (systemPrompt: string, userPrompt: string) =>
      dispatch(systemPrompt, userPrompt, {
        model: config.supervisorModel,
        maxTurns: 2,
        turnTimeoutMs: supervisorTurnMs,
        totalTimeoutMs: supervisorTotalMs,
        disallowedTools: ALL_TOOLS,
      }),
    workerDispatch: (systemPrompt: string, userPrompt: string) =>
      dispatch(systemPrompt, userPrompt, {
        model: config.workerModel,
        maxTurns: config.maxWorkerTurns ?? 15,
        turnTimeoutMs: workerTurnMs,
        totalTimeoutMs: workerTotalMs,
      }),
  }
}
