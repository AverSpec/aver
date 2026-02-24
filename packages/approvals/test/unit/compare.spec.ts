import { describe, it, expect } from 'vitest'
import { compareValues, generateDiff } from '../../src/compare'
import type { Serializer } from '../../src/serializers'

describe('compareValues', () => {
  it('returns equal for identical strings', () => {
    const result = compareValues('hello', 'hello')
    expect(result.equal).toBe(true)
  })

  it('returns not equal for different strings', () => {
    const result = compareValues('hello', 'world')
    expect(result.equal).toBe(false)
  })

  describe('with normalize', () => {
    const serializerWithNormalize: Serializer = {
      name: 'text',
      fileExtension: 'txt',
      serialize: (v: unknown) => String(v),
      normalize: (value: string) => value.replace(/\s+/g, ' ').trim(),
    }

    it('normalizes both values before comparing', () => {
      const result = compareValues(
        'hello   world',
        'hello world',
        { serializer: serializerWithNormalize },
      )
      expect(result.equal).toBe(true)
    })

    it('still detects mismatches after normalization', () => {
      const result = compareValues(
        'hello   world',
        'goodbye world',
        { serializer: serializerWithNormalize },
      )
      expect(result.equal).toBe(false)
    })
  })

  describe('without normalize', () => {
    const serializerWithoutNormalize: Serializer = {
      name: 'text',
      fileExtension: 'txt',
      serialize: (v: unknown) => String(v),
    }

    it('compares raw strings when no normalize method', () => {
      const result = compareValues(
        'hello   world',
        'hello world',
        { serializer: serializerWithoutNormalize },
      )
      expect(result.equal).toBe(false)
    })
  })

  describe('with custom comparator', () => {
    it('uses the custom comparator', () => {
      const lenComparator = (a: string, b: string) => ({
        equal: a.length === b.length,
      })

      const result = compareValues('abc', 'xyz', { comparator: lenComparator })
      expect(result.equal).toBe(true)
    })

    it('custom comparator receives normalized values', () => {
      let receivedA = ''
      let receivedB = ''
      const capturingComparator = (a: string, b: string) => {
        receivedA = a
        receivedB = b
        return { equal: true }
      }

      const normalizer: Serializer = {
        name: 'text',
        fileExtension: 'txt',
        serialize: (v: unknown) => String(v),
        normalize: (value: string) => value.toUpperCase(),
      }

      compareValues('hello', 'world', {
        comparator: capturingComparator,
        serializer: normalizer,
      })

      expect(receivedA).toBe('HELLO')
      expect(receivedB).toBe('WORLD')
    })

    it('custom comparator can detect mismatch', () => {
      const strictComparator = (a: string, b: string) => ({
        equal: a === b,
      })

      const result = compareValues('abc', 'def', { comparator: strictComparator })
      expect(result.equal).toBe(false)
    })
  })
})

describe('generateDiff', () => {
  it('produces a unified diff', () => {
    const diff = generateDiff('line1\nline2\n', 'line1\nline3\n')
    expect(diff).toContain('-line2')
    expect(diff).toContain('+line3')
  })
})
