import { createTwoFilesPatch } from 'diff'

export interface ComparisonResult {
  equal: boolean
  diff?: string
}

export function compareValues(
  approved: string,
  received: string,
): ComparisonResult {
  return { equal: approved === received }
}

export function generateDiff(approved: string, received: string): string {
  return createTwoFilesPatch('approved', 'received', approved, received, '', '', {
    context: 3,
  })
}
