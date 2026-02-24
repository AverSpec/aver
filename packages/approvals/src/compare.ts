import { createTwoFilesPatch } from 'diff'
import type { Comparator } from './types'
import type { Serializer } from './serializers'

export interface ComparisonResult {
  equal: boolean
  diff?: string
}

export interface CompareOptions {
  comparator?: Comparator
  serializer?: Serializer
}

export function compareValues(
  approved: string,
  received: string,
  options?: CompareOptions,
): ComparisonResult {
  let a = approved
  let r = received
  const normalize = options?.serializer?.normalize
  if (normalize) {
    a = normalize(a)
    r = normalize(r)
  }
  if (options?.comparator) {
    return options.comparator(a, r)
  }
  return { equal: a === r }
}

export function generateDiff(approved: string, received: string): string {
  return createTwoFilesPatch('approved', 'received', approved, received, '', '', {
    context: 3,
  })
}
