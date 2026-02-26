import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildWorkerPrompts, type WorkerPromptInput } from './prompt.js'
import { loadSkill } from './skill-loader.js'
import { buildApprovalHook, type PermissionLevel } from '../shell/hooks.js'
import type { WorkerDispatch, WorkerResult, ArtifactContent, AgentConfig } from '../types.js'
import type { Scenario } from '@aver/workspace'

export type { WorkerPromptInput } from './prompt.js'
export { buildWorkerPrompts } from './prompt.js'

export interface WorkerDispatchResult {
  result: WorkerResult
  tokenUsage: number
}

const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']
const DEFAULT_WORKER_TURN_MS = 180_000
const DEFAULT_WORKER_TOTAL_MS = 1_800_000

/**
 * Legacy dispatch function used by CycleEngine.
 * Builds prompts via buildWorkerPrompts, dispatches via SDK, and returns raw text as summary.
 * Workers no longer return structured JSON — the Observer compresses output into observations.
 */
export async function dispatchWorker(
  dispatch: WorkerDispatch,
  artifacts: ArtifactContent[],
  config: AgentConfig,
  scenarioDetail?: Scenario,
  projectContext?: string,
): Promise<WorkerDispatchResult> {
  const skillResult = await loadSkill(dispatch.skill)
  if ('warning' in skillResult) {
    const w = skillResult.warning
    console.warn(`[aver:worker] skill-load-failed — skill=${w.skill}: ${w.message}`, w.cause)
  }

  // Build prompts using the new interface
  const promptInput: WorkerPromptInput = {
    goal: dispatch.goal,
    observationBlock: artifacts.map((a) => `### ${a.name} (${a.type})\n\n${a.content}`).join('\n\n---\n\n'),
    scenarioDetail: scenarioDetail
      ? {
          id: scenarioDetail.id,
          name: scenarioDetail.behavior,
          stage: scenarioDetail.stage,
          questions: scenarioDetail.questions.filter((q) => !q.answer).map((q) => q.text),
          notes: [
            scenarioDetail.context,
            scenarioDetail.story ? `Story: ${scenarioDetail.story}` : undefined,
          ]
            .filter(Boolean)
            .join('. ') || undefined,
        }
      : undefined,
    permissionLevel: dispatch.permissionLevel ?? 'read_only',
    skill: dispatch.skill,
  }

  const { systemPrompt, userPrompt: baseUserPrompt } = buildWorkerPrompts(promptInput, skillResult.content)

  // Append project context to user prompt if available (legacy compat)
  let userPrompt = baseUserPrompt
  if (projectContext) {
    userPrompt += `\n\n## Project Context\n\n${projectContext}`
  }

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
    const canUseTool = buildCanUseTool(dispatch.permissionLevel as PermissionLevel)
    const q = query({
      prompt: userPrompt,
      options: {
        model: config.model.worker,
        systemPrompt,
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

  // Workers no longer return structured JSON. Return raw text as summary.
  const status = extractStatus(assistantText)
  const result: WorkerResult = {
    summary: assistantText,
    artifacts: [],
    status,
    tokenUsage,
  }
  return { result, tokenUsage }
}

/**
 * Extract STATUS signal from worker output text.
 */
function extractStatus(text: string): 'complete' | 'stuck' {
  if (/STATUS:\s*stuck/i.test(text)) return 'stuck'
  if (/STATUS:\s*continue/i.test(text)) return 'stuck' // needs more work = not complete
  return 'complete'
}

function buildCanUseTool(level: PermissionLevel) {
  // Non-interactive: sensitive commands (git push, rm -rf, sudo) are always denied
  const hook = buildApprovalHook(level, async () => false)
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => {
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
      const turnController = new AbortController()

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
    it.return?.()
  }
}
