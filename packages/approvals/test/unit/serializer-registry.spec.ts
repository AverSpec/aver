import { describe, it, expect, afterEach } from 'vitest'
import {
  registerSerializer,
  resetSerializers,
  resolveSerializer,
  type Serializer,
} from '../../src/serializers'

describe('serializer registry', () => {
  afterEach(() => {
    resetSerializers()
  })

  it('resolves built-in json serializer', () => {
    const s = resolveSerializer('json')
    expect(s.name).toBe('json')
    expect(s.fileExtension).toBe('json')
  })

  it('resolves built-in text serializer', () => {
    const s = resolveSerializer('text')
    expect(s.name).toBe('text')
    expect(s.fileExtension).toBe('txt')
  })

  it('falls back to text for unknown names when no custom registered', () => {
    const s = resolveSerializer('xml')
    expect(s.name).toBe('text')
  })

  it('registers and resolves a custom serializer', () => {
    const xmlSerializer: Serializer = {
      name: 'xml',
      fileExtension: 'xml',
      serialize: (value: unknown) => `<root>${String(value)}</root>`,
    }
    registerSerializer('xml', xmlSerializer)

    const s = resolveSerializer('xml')
    expect(s.name).toBe('xml')
    expect(s.fileExtension).toBe('xml')
    expect(s.serialize('hello')).toBe('<root>hello</root>')
  })

  it('custom serializer takes priority over built-in', () => {
    const customJson: Serializer = {
      name: 'json',
      fileExtension: 'json',
      serialize: (value: unknown) => JSON.stringify(value),
    }
    registerSerializer('json', customJson)

    const s = resolveSerializer('json')
    // Custom version should not add newline/pretty-print
    expect(s.serialize({ a: 1 })).toBe('{"a":1}')
  })

  it('resetSerializers clears custom registry', () => {
    const csv: Serializer = {
      name: 'csv',
      fileExtension: 'csv',
      serialize: (value: unknown) => String(value),
    }
    registerSerializer('csv', csv)
    expect(resolveSerializer('csv').name).toBe('csv')

    resetSerializers()

    // After reset, 'csv' should fall back to text
    const s = resolveSerializer('csv')
    expect(s.name).toBe('text')
  })

  it('custom serializer with normalize method is available', () => {
    const trimSerializer: Serializer = {
      name: 'trim',
      fileExtension: 'txt',
      serialize: (value: unknown) => String(value),
      normalize: (value: string) => value.trim(),
    }
    registerSerializer('trim', trimSerializer)

    const s = resolveSerializer('trim')
    expect(s.normalize).toBeDefined()
    expect(s.normalize!('  hello  ')).toBe('hello')
  })

  it('json serializer throws with descriptive error for circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj // Create circular reference

    const s = resolveSerializer('json')
    expect(() => s.serialize(obj)).toThrow(
      'Cannot serialize: circular reference detected',
    )
  })

  it('json serializer throws with descriptive error for BigInt values', () => {
    const obj = { value: BigInt(12345) }

    const s = resolveSerializer('json')
    expect(() => s.serialize(obj)).toThrow(
      'Cannot serialize: BigInt values are not supported',
    )
  })

  it('json serializer handles nested circular references', () => {
    const inner: Record<string, unknown> = { b: 2 }
    const outer: Record<string, unknown> = { a: inner }
    inner.parent = outer // Create circular reference

    const s = resolveSerializer('json')
    expect(() => s.serialize(outer)).toThrow(
      'Cannot serialize: circular reference detected',
    )
  })

  it('json serializer handles BigInt in nested objects', () => {
    const obj = {
      data: {
        nested: {
          value: BigInt(999),
        },
      },
    }

    const s = resolveSerializer('json')
    expect(() => s.serialize(obj)).toThrow(
      'Cannot serialize: BigInt values are not supported',
    )
  })
})
