export type SerializerName = 'json' | 'text' | 'html'

export interface Serializer {
  name: SerializerName
  fileExtension: string
  serialize(value: unknown): string
  normalize?(value: string): string
}

export function jsonSerializer(): Serializer {
  return {
    name: 'json',
    fileExtension: 'json',
    serialize: (value: unknown) => stableStringify(value),
  }
}

export function textSerializer(): Serializer {
  return {
    name: 'text',
    fileExtension: 'txt',
    serialize: (value: unknown) => String(value),
  }
}

export function htmlSerializer(): Serializer {
  return {
    name: 'html',
    fileExtension: 'html',
    serialize: (value: unknown) => String(value),
  }
}

export function resolveSerializer(name: SerializerName): Serializer {
  switch (name) {
    case 'json':
      return jsonSerializer()
    case 'html':
      return htmlSerializer()
    case 'text':
    default:
      return textSerializer()
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2) + '\n'
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      result[key] = sortValue(obj[key])
    }
    return result
  }
  return value
}
