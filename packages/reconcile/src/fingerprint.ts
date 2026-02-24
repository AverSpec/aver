import type { UncoveredOperation } from './types.js'

/**
 * Generate a stable fingerprint for deduplication.
 * Two operations with the same domain+name+kind get the same fingerprint.
 */
export function fingerprint(op: UncoveredOperation): string {
  return `${op.domain}:${op.kind}:${op.operation}`
}

/**
 * Deduplicate uncovered operations by fingerprint.
 * Keeps the entry with the highest event count.
 */
export function deduplicate(ops: UncoveredOperation[]): UncoveredOperation[] {
  const map = new Map<string, UncoveredOperation>()
  for (const op of ops) {
    const fp = fingerprint(op)
    const existing = map.get(fp)
    if (!existing || op.eventCount > existing.eventCount) {
      map.set(fp, op)
    }
  }
  return [...map.values()]
}
