import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildWorkerPrompt } from './prompt.js'
import { loadSkill } from './skill-loader.js'
import { parseWorkerResult } from './results.js'
import { buildApprovalHook, type PermissionLevel } from '../shell/hooks.js'
import type { WorkerDispatch, WorkerResult, ArtifactContent, AgentConfig, WorkerInput } from '../types.js'
import type { Scenario } from '@aver/workspace'

export interface WorkerDispatchResult {
  result: WorkerResult
  tokenUsage: number
}

const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']
const DEFAULT_WORKER_TURN_MS = 180_000
const DEFAULT_WORKER_TOTAL_MS = 1_800_000

export async function dispatchWorker(
  dispatch: WorkerDispatch,
  artifacts: ArtifactContent[],
  config: AgentConfig,
  scenarioDetail?: Scenario,
  projectContext?: string,
): Promise<WorkerDispatchResult> {
  const input: WorkerInput = {
    goal: dispatch.goal,
    artifacts,
    scenarioDetail,
    permissionLevel: dispatch.permissionLevel as 'read_only' | 'edit' | 'full',
    projectContext,
  }

  const skillResult = await loadSkill(dispatch.skill)
  if ('warning' in skillResult) {
    const w = skillResult.warning
    console.warn(`[aver:worker] skill-load-failed — skill=${w.skill}: ${w.message}`, w.cause)
  }
  const { system, user } = buildWorkerPrompt(input, dispatch.skill, skillResult.content)
  const disallowedTools = buildDisallowedTools(dispatch.permissionLevel)

  const turnTimeoutMs = config.timeouts?.workerTurnMs ?? DEFAULT_WORKER_TURN_MS
  const totalTimeoutMs = config.timeouts?.workerTotalMs ?? DEFAULT_WORKER_TOTAL_MS

  // Total-duration controller — fires once the overall deadline elapses.
  const totalController = new AbortController()
  const totalTimer = setTimeout(() => {
    totalController.abort(
      new Error(`Worker dispatch exceeded total timeout of ${totalTimeoutMs}ms`),
    )
  }, totalTimeoutMs)

  let assistantText = ''
  let tokenUsage = 0

  try {
    // Permission enforcement: two layers of defense
    // 1. disallowedTools — SDK blocks these tools before they can execute
    // 2. canUseTool — our approval hook (shell/hooks.ts) enforces tiered permissions:
    //    read_only: only read tools, edit: + write tools + safe bash, full: all except sensitive bash
    //    Sensitive commands (git push, rm -rf, sudo) are always denied in non-interactive mode.
    const canUseTool = buildCanUseTool(dispatch.permissionLevel as PermissionLevel)
    const q = query({
      prompt: user,
      options: {
        model: config.model.worker,
        systemPrompt: system,
        disallowedTools,
        maxTurns: config.cycles.maxWorkerIterations,
        canUseTool,
        persistSession: false,
        ...(config.claudeExecutablePath && { pathToClaudeCodeExecutable: config.claudeExecutablePath }),
      },
    })

    for await (const message of withAbort(q, totalController.signal, turnTimeoutMs)) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            assistantText += block.text
          }
        }
      }
      if (message.type === 'result' && message.subtype === 'success') {
        tokenUsage = message.usage.input_tokens + message.usage.output_tokens
      }
      if (message.type === 'result' && message.subtype !== 'success') {
        const errors = 'errors' in message && Array.isArray(message.errors) ? message.errors : []
        throw new Error(`Worker dispatch failed: ${errors.join('; ') || `${message.subtype}`}`)
      }
    }
  } finally {
    clearTimeout(totalTimer)
  }

  const result = parseWorkerResult(assistantText)
  result.tokenUsage = tokenUsage
  return { result, tokenUsage }
}

function buildCanUseTool(level: PermissionLevel) {
  // Non-interactive: sensitive commands (git push, rm -rf, sudo) are always denied
  const hook = buildApprovalHook(level, async () => false)
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => {
    // session_id and transcript_path are empty — the hook doesn't use them today.
    // Thread real values here when CycleEngine manages live sessions.
    const result = await hook(
      {
        hook_event_name: 'PreToolUse',
        tool_name: toolName,
        tool_input: input,
        session_id: '',
        transcript_path: '',
        cwd: process.cwd(),
      },
      undefined,
      { signal: options.signal },
    )
    const decision = result.hookSpecificOutput?.permissionDecision
    if (decision === 'deny') {
      return { behavior: 'deny' as const, message: result.hookSpecificOutput?.reason ?? `${toolName} denied` }
    }
    return { behavior: 'allow' as const }
  }
}

function buildDisallowedTools(permissionLevel: string): string[] {
  switch (permissionLevel) {
    case 'read_only':
      return [...WRITE_TOOLS, 'Bash', 'Task']
    case 'edit':
      return ['Task']
    case 'full':
      return []
    default:
      return [...WRITE_TOOLS, 'Task']
  }
}

/**
 * Wraps an async iterable so that iteration aborts when either:
 *   (a) the `totalSignal` fires (overall deadline), or
 *   (b) a single `next()` call takes longer than `turnTimeoutMs`.
 *
 * The per-turn timeout resets after each successfully received message, so a
 * slow-but-alive stream keeps flowing while a completely hung call is aborted.
 */
async function* withAbort<T>(
  iter: AsyncIterable<T>,
  totalSignal: AbortSignal,
  turnTimeoutMs: number,
): AsyncGenerator<T> {
  if (totalSignal.aborted) {
    throw totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Worker aborted')
  }

  const it = iter[Symbol.asyncIterator]()

  try {
    while (true) {
      // Per-turn controller — reset each iteration
      const turnController = new AbortController()

      // Propagate total abort into the turn controller
      const onTotalAbort = () =>
        turnController.abort(
          totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Worker total timeout'),
        )
      if (totalSignal.aborted) {
        throw totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Worker total timeout')
      }
      totalSignal.addEventListener('abort', onTotalAbort, { once: true })

      const turnTimer = setTimeout(() => {
        turnController.abort(
          new Error(`Worker turn timed out after ${turnTimeoutMs}ms`),
        )
      }, turnTimeoutMs)

      let result: IteratorResult<T>
      try {
        result = await Promise.race([
          it.next(),
          new Promise<never>((_, reject) => {
            if (turnController.signal.aborted) {
              reject(
                turnController.signal.reason instanceof Error
                  ? turnController.signal.reason
                  : new Error('Worker aborted'),
              )
              return
            }
            const onAbort = () =>
              reject(
                turnController.signal.reason instanceof Error
                  ? turnController.signal.reason
                  : new Error('Worker aborted'),
              )
            turnController.signal.addEventListener('abort', onAbort, { once: true })
          }),
        ])
      } finally {
        clearTimeout(turnTimer)
        totalSignal.removeEventListener('abort', onTotalAbort)
      }

      if (result.done) break
      yield result.value
    }
  } finally {
    await it.return?.()
  }
}
