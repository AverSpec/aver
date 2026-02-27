import { z } from 'zod'
import type { JudgeProvider } from './providers/types.js'

export const VerdictSchema = z.object({
  pass: z.boolean(),
  reasoning: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type Verdict = z.infer<typeof VerdictSchema>

export const JUDGE_SYSTEM_PROMPT = `You are an evaluation judge. You assess LLM outputs against specific criteria.

You will receive:
- CONTENT: The output to evaluate
- RUBRIC: The specific criterion to evaluate against

Evaluate whether the content meets the rubric criterion. Think step by step, then give your verdict.

Rules:
- Evaluate the CONTENT against the RUBRIC only. Do not apply criteria not in the rubric.
- A passing verdict means the content satisfies the criterion. It does not need to be perfect.
- Concise content is acceptable unless the rubric specifically requires detail.
- Do not penalize valid alternative approaches or formats unless the rubric specifies format requirements.`

export function buildJudgePrompt(content: string, rubric: string): string {
  return `## CONTENT\n\n${content}\n\n## RUBRIC\n\n${rubric}`
}

let defaultProvider: JudgeProvider | undefined

export function setDefaultProvider(provider: JudgeProvider): void {
  defaultProvider = provider
}

export function resetDefaultProvider(): void {
  defaultProvider = undefined
}

export function getDefaultProvider(): JudgeProvider {
  if (!defaultProvider) {
    throw new Error(
      '@aver/eval: No judge provider configured. Call setDefaultProvider() before using judge().',
    )
  }
  return defaultProvider
}

export async function judge(content: string, rubric: string): Promise<Verdict> {
  return getDefaultProvider().judge(content, rubric)
}
