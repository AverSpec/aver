import { buildSupervisorPrompt, type SupervisorPromptInput, type ActiveWorkerInfo } from './prompt.js'
import { parseDecision } from './decisions.js'
import type { SupervisorDecision } from '../network/agent-network.js'
import type { Trigger } from '../network/triggers.js'
import type { Scenario } from '../workspace/types.js'

export { parseDecision } from './decisions.js'
export type { SupervisorPromptInput, ActiveWorkerInfo } from './prompt.js'

export interface SupervisorResult {
  decision: SupervisorDecision
  tokenUsage: number
}

export interface SupervisorDispatchDeps {
  dispatch: (systemPrompt: string, userPrompt: string) => Promise<{ response: string; tokenUsage: number }>
}

/**
 * Build supervisor prompts from structured input.
 *
 * This is the primary entry point for AgentNetwork: it assembles the
 * system and user prompts that get sent to the LLM dispatcher.
 */
export function buildPrompts(input: SupervisorPromptInput): { system: string; user: string } {
  return buildSupervisorPrompt(input)
}

/**
 * Full supervisor dispatch: build prompts, call LLM, parse decision.
 *
 * Convenience wrapper that combines prompt building, dispatching, and
 * decision parsing into a single call.
 */
export async function dispatchSupervisor(
  input: SupervisorPromptInput,
  deps: SupervisorDispatchDeps,
): Promise<SupervisorResult> {
  const { system, user } = buildSupervisorPrompt(input)
  const { response, tokenUsage } = await deps.dispatch(system, user)
  const decision = parseDecision(response)
  return { decision, tokenUsage }
}
