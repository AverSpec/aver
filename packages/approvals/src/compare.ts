import { createTwoFilesPatch } from 'diff'
import type { ApproveOptions } from './types'

export interface ComparisonResult {
  equal: boolean
  diff?: string
}

export function compareValues(
  approved: string,
  received: string,
  compare?: ApproveOptions['compare'],
): ComparisonResult {
  if (!compare) return { equal: approved === received }
  const result = compare(approved, received)
  if (typeof result === 'boolean') return { equal: result }
  return { equal: result.equal, diff: result.diff }
}

export function generateDiff(approved: string, received: string): string {
  return createTwoFilesPatch('approved', 'received', approved, received, '', '', {
    context: 3,
  })
}
