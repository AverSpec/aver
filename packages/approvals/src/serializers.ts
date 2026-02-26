import type { SerializerName } from './types'
export type { SerializerName }

export interface Serializer {
  name: SerializerName
  fileExtension: string
  serialize(value: unknown): string
  normalize?(value: string): string
}

const customSerializers = new Map<string, Serializer>()

export function registerSerializer(name: string, serializer: Serializer): void {
  customSerializers.set(name, serializer)
}

export function resetSerializers(): void {
  customSerializers.clear()
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

export function resolveSerializer(name: SerializerName): Serializer {
  const custom = customSerializers.get(name)
  if (custom) return custom

  switch (name) {
    case 'json':
      return jsonSerializer()
    case 'text':
    default:
      return textSerializer()
  }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(sortValue(value), null, 2) + '\n'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('circular') || message.includes('Converting circular')) {
      throw new Error('Cannot serialize: circular reference detected')
    }
    throw error
  }
}

function sortValue(value: unknown, seen = new WeakSet<object>()): unknown {
  // Check for BigInt
  if (typeof value === 'bigint') {
    throw new Error('Cannot serialize: BigInt values are not supported')
  }

  // Check for circular references
  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Cannot serialize: circular reference detected')
    }
    seen.add(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item, seen))
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      result[key] = sortValue(obj[key], seen)
    }
    return result
  }
  return value
}
