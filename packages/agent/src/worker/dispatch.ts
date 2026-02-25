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

export async function dispatchWorker(
  dispatch: WorkerDispatch,
  artifacts: ArtifactContent[],
  config: AgentConfig,
  scenarioDetail?: Scenario,
): Promise<WorkerDispatchResult> {
  const input: WorkerInput = {
    goal: dispatch.goal,
    artifacts,
    scenarioDetail,
  }

  const skillResult = await loadSkill(dispatch.skill)
  if ('warning' in skillResult) {
    const w = skillResult.warning
    console.warn(`[aver:worker] skill-load-failed — skill=${w.skill}: ${w.message}`, w.cause)
  }
  const { system, user } = buildWorkerPrompt(input, dispatch.skill, skillResult.content)
  const disallowedTools = buildDisallowedTools(dispatch.permissionLevel)

  let assistantText = ''
  let tokenUsage = 0

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

  for await (const message of q) {
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
