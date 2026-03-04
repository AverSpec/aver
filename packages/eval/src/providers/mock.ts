import type { JudgeProvider } from './types.js'
import type { Verdict } from '../judge.js'

export interface MockRule {
  match: string
  verdict: Verdict
}

export function mockProvider(rules: MockRule[]): JudgeProvider {
  return {
    async judge(_content: string, rubric: string): Promise<Verdict> {
      for (const rule of rules) {
        if (rubric.toLowerCase().includes(rule.match.toLowerCase())) {
          return rule.verdict
        }
      }
      return { pass: false, reasoning: `No matching mock rule for rubric: "${rubric}"`, confidence: 'low' }
    },
  }
}
