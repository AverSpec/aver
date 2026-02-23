import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildWorkerPrompt } from './prompt.js'
import { parseWorkerResult } from './results.js'
import type { WorkerDispatch, WorkerResult, ArtifactContent, AgentConfig } from '../types.js'

export interface WorkerDispatchResult {
  result: WorkerResult
  tokenUsage: number
}

const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']

export async function dispatchWorker(
  dispatch: WorkerDispatch,
  artifacts: ArtifactContent[],
  config: AgentConfig,
): Promise<WorkerDispatchResult> {
  const input = {
    goal: dispatch.goal,
    artifacts,
  }

  const { system, user } = buildWorkerPrompt(input, dispatch.skill)
  const disallowedTools = buildDisallowedTools(dispatch.permissionLevel)

  let assistantText = ''
  let tokenUsage = 0

  const q = query({
    prompt: user,
    options: {
      model: config.model.worker,
      systemPrompt: system,
      disallowedTools,
      maxTurns: config.cycles.maxWorkerIterations,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
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
    if (message.type === 'result' && message.subtype === 'error') {
      throw new Error(`Worker dispatch failed: ${(message as any).error ?? 'unknown SDK error'}`)
    }
  }

  const result = parseWorkerResult(assistantText)
  result.tokenUsage = tokenUsage
  return { result, tokenUsage }
}

function buildDisallowedTools(permissionLevel: string): string[] {
  switch (permissionLevel) {
    case 'read_only':
      return [...WRITE_TOOLS, 'Bash']
    case 'edit':
      return []
    case 'full':
      return []
    default:
      return [...WRITE_TOOLS]
  }
}
