import { query } from '@anthropic-ai/claude-agent-sdk'
import { VerdictSchema, JUDGE_SYSTEM_PROMPT, buildJudgePrompt } from '../judge.js'
import type { JudgeProvider } from './types.js'
import type { Verdict } from '../judge.js'

export interface AgentSdkProviderOptions {
  model?: string
  claudeExecutablePath?: string
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export function agentSdkProvider(opts?: AgentSdkProviderOptions): JudgeProvider {
  const model = opts?.model ?? DEFAULT_MODEL
  const claudePath = opts?.claudeExecutablePath

  return {
    async judge(content: string, rubric: string): Promise<Verdict> {
      const prompt = buildJudgePrompt(content, rubric)

      const verdictJsonSchema = {
        type: 'object' as const,
        properties: {
          pass: { type: 'boolean' as const },
          reasoning: { type: 'string' as const },
          confidence: { type: 'string' as const, enum: ['high', 'medium', 'low'] },
        },
        required: ['pass', 'reasoning'] as const,
        additionalProperties: false,
      }

      let structuredOutput: unknown

      const q = query({
        prompt,
        options: {
          model,
          systemPrompt: JUDGE_SYSTEM_PROMPT,
          allowedTools: [],
          maxTurns: 1,
          outputFormat: { type: 'json_schema', schema: verdictJsonSchema },
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          thinking: { type: 'disabled' },
          ...(claudePath && { pathToClaudeCodeExecutable: claudePath }),
        },
      })

      for await (const message of q) {
        if (message.type === 'result' && message.subtype === 'success') {
          structuredOutput = message.structured_output
        }
        if (message.type === 'result' && message.subtype === 'error_max_structured_output_retries') {
          throw new Error('@aver/eval: Judge failed to produce structured output after max retries')
        }
        if (message.type === 'result' && 'is_error' in message && message.is_error) {
          const msg = message as Record<string, unknown>
          const errors = Array.isArray(msg.errors) ? (msg.errors as string[]) : []
          throw new Error(`@aver/eval: Judge dispatch failed: ${errors.join(', ') || 'unknown error'}`)
        }
      }

      if (!structuredOutput) {
        throw new Error('@aver/eval: Judge returned no structured output')
      }

      return VerdictSchema.parse(structuredOutput)
    },
  }
}
