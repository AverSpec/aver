import type { Verdict } from '../judge.js'

export interface JudgeProvider {
  judge(content: string, rubric: string): Promise<Verdict>
}
