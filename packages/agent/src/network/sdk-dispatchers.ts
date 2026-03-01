import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk'
import { withAbort } from './with-abort.js'
import type { PermissionLevel } from '../shell/hooks.js'
import { buildCanUseTool, buildDisallowedTools } from '../worker/dispatch.js'
import type { RawStreamBlock } from './stream-events.js'

const DEFAULT_SUPERVISOR_TURN_MS = 120_000
const DEFAULT_SUPERVISOR_TOTAL_MS = 300_000
const DEFAULT_WORKER_TURN_MS = 180_000
const DEFAULT_WORKER_TOTAL_MS = 1_800_000

// SDK requires a numeric maxTurns. Workers run until done — the total timeout
// (default 30min) is the real budget guard, not turn count.
const WORKER_MAX_TURNS = 500

export interface SdkDispatcherConfig {
  claudeExecutablePath?: string
  supervisorModel?: string
  workerModel?: string
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
      canUseTool?: CanUseTool
      onStreamBlock?: (block: RawStreamBlock) => void
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
      const queryOptions = {
        ...baseOptions,
        systemPrompt,
        model: options.model,
        maxTurns: options.maxTurns,
        persistSession: false,
        ...(options.disallowedTools && { disallowedTools: options.disallowedTools }),
        ...(options.canUseTool && { canUseTool: options.canUseTool }),
      }

      const q = query({
        prompt: userPrompt,
        options: queryOptions,
      })

      for await (const message of withAbort(q, totalController.signal, options.turnTimeoutMs)) {
        if (message.type === 'assistant') {
          for (const block of (message as any).message.content) {
            if (block.type === 'text') {
              assistantText += block.text
              options.onStreamBlock?.({ type: 'text', text: block.text })
            }
            if (block.type === 'tool_use') {
              options.onStreamBlock?.({
                type: 'tool_use',
                tool: block.name ?? 'unknown',
                input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input).slice(0, 500),
              })
            }
            if (block.type === 'tool_result') {
              options.onStreamBlock?.({
                type: 'tool_result',
                tool: 'unknown',
                output: typeof block.content === 'string' ? block.content.slice(0, 500) : JSON.stringify(block.content).slice(0, 500),
              })
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

  // Supervisor: no tools, maxTurns 4 (structured output pattern — needs
  // headroom for retries with large prompts, e.g. after discuss/human:answer)
  const ALL_TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'Task', 'NotebookEdit', 'WebFetch', 'WebSearch']

  return {
    supervisorDispatch: (systemPrompt: string, userPrompt: string) =>
      dispatch(systemPrompt, userPrompt, {
        model: config.supervisorModel,
        maxTurns: 4,
        turnTimeoutMs: supervisorTurnMs,
        totalTimeoutMs: supervisorTotalMs,
        disallowedTools: ALL_TOOLS,
      }),
    workerDispatch: (systemPrompt: string, userPrompt: string, permission: PermissionLevel, onStreamBlock?: (block: RawStreamBlock) => void) =>
      dispatch(systemPrompt, userPrompt, {
        model: config.workerModel,
        maxTurns: WORKER_MAX_TURNS,
        turnTimeoutMs: workerTurnMs,
        totalTimeoutMs: workerTotalMs,
        disallowedTools: buildDisallowedTools(permission),
        canUseTool: buildCanUseTool(permission),
        onStreamBlock,
      }),
    observerDispatch: async (systemPrompt: string, userPrompt: string) => {
      const result = await dispatch(systemPrompt, userPrompt, {
        model: config.supervisorModel, // Observer uses same model as supervisor (fast, small)
        maxTurns: 1,
        turnTimeoutMs: supervisorTurnMs,
        totalTimeoutMs: supervisorTotalMs,
        disallowedTools: ALL_TOOLS,
      })
      return result.response
    },
  }
}
