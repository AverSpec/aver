/** OTLP attribute shape as received in JSON format. */
export interface OtlpAttribute {
  key: string
  value: { stringValue?: string; intValue?: string; boolValue?: boolean; doubleValue?: number }
}

/** Convert OTLP attributes array to a plain record. */
export function parseAttributes(attrs?: OtlpAttribute[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!attrs) return result
  for (const attr of attrs) {
    const v = attr.value
    if (v.stringValue !== undefined) result[attr.key] = v.stringValue
    else if (v.intValue !== undefined) result[attr.key] = Number(v.intValue)
    else if (v.boolValue !== undefined) result[attr.key] = v.boolValue
    else if (v.doubleValue !== undefined) result[attr.key] = v.doubleValue
  }
  return result
}

/** Normalize OTLP parentSpanId sentinels to undefined. */
export function normalizeParentSpanId(parentSpanId: string | undefined | null): string | undefined {
  if (!parentSpanId || parentSpanId === '' || parentSpanId === '0000000000000000') {
    return undefined
  }
  return parentSpanId
}
