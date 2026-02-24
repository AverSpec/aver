/**
 * Redacts specified fields from a payload object.
 *
 * Note: Only scrubs top-level fields. Nested objects (e.g. `{ user: { email: 'x' } }`)
 * are not traversed. Use flat payload structures or pre-flatten before scrubbing.
 */
export function scrubPayload(payload: unknown, fields: string[]): unknown {
  if (!payload || typeof payload !== 'object' || fields.length === 0) return payload
  const result: Record<string, unknown> = { ...(payload as Record<string, unknown>) }
  for (const field of fields) {
    if (field in result) {
      result[field] = '[REDACTED]'
    }
  }
  return result
}
