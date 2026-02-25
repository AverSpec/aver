import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildSupervisorPrompt } from './prompt.js'
import { parseDecision } from './decisions.js'
import type { SupervisorInput, SupervisorDecision, AgentConfig } from '../types.js'

export interface SupervisorResult {
  decision: SupervisorDecision
  tokenUsage: number
}

export async function dispatchSupervisor(
  input: SupervisorInput,
  config: AgentConfig,
): Promise<SupervisorResult> {
  const { system, user } = buildSupervisorPrompt(input)

  let assistantText = ''
  let tokenUsage = 0

  // Supervisor is text-only: allowedTools: [] prevents all tool use, so no
  // permission hooks are needed. bypassPermissions avoids interactive prompts
  // since the supervisor runs non-interactively with maxTurns: 1.
  const q = query({
    prompt: user,
    options: {
      model: config.model.supervisor,
      systemPrompt: system,
      allowedTools: [],
      maxTurns: 1,
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
    if (message.type === 'result' && message.subtype !== 'success') {
      const errors = 'errors' in message && Array.isArray(message.errors) ? message.errors : []
      throw new Error(`Supervisor dispatch failed: ${errors.join('; ') || `${message.subtype}`}`)
    }
  }

  const decision = parseDecision(assistantText)
  return { decision, tokenUsage }
}
