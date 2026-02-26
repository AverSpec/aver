import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildSupervisorPrompt } from './prompt.js'
import { parseDecision } from './decisions.js'
import type { SupervisorInput, SupervisorDecision, AgentConfig } from '../types.js'

export interface SupervisorResult {
  decision: SupervisorDecision
  tokenUsage: number
}

const DEFAULT_SUPERVISOR_CALL_MS = 120_000

export async function dispatchSupervisor(
  input: SupervisorInput,
  config: AgentConfig,
): Promise<SupervisorResult> {
  const { system, user } = buildSupervisorPrompt(input)
  const timeoutMs = config.timeouts?.supervisorCallMs ?? DEFAULT_SUPERVISOR_CALL_MS

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`Supervisor dispatch timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  let assistantText = ''
  let tokenUsage = 0

  try {
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
        ...(config.claudeExecutablePath && { pathToClaudeCodeExecutable: config.claudeExecutablePath }),
      },
    })

    for await (const message of withAbort(q, controller.signal)) {
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
  } finally {
    clearTimeout(timer)
  }

  const decision = parseDecision(assistantText)
  return { decision, tokenUsage }
}

/**
 * Wraps an async iterable so that it throws when the given AbortSignal fires.
 * Each `next()` call races against the signal, so a hung iteration is
 * interrupted as soon as the timeout elapses.
 */
async function* withAbort<T>(
  iter: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Aborted')
  }

  const it = iter[Symbol.asyncIterator]()

  try {
    while (true) {
      // Race the next message against the abort signal
      const result = await Promise.race([
        it.next(),
        new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'))
            return
          }
          const onAbort = () =>
            reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
        }),
      ])

      if (result.done) break
      yield result.value
    }
  } finally {
    // Best-effort cleanup — the iterator may or may not support return()
    await it.return?.()
  }
}
