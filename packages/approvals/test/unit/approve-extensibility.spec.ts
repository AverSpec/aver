import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../src/approve'
import { registerSerializer, resetSerializers, type Serializer } from '../../src/serializers'

describe('approve() extensibility', () => {
  let workDir: string
  let savedApprove: string | undefined

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aver-ext-test-'))
    savedApprove = process.env.AVER_APPROVE
    delete process.env.AVER_APPROVE
  })

  afterEach(() => {
    if (savedApprove !== undefined) {
      process.env.AVER_APPROVE = savedApprove
    } else {
      delete process.env.AVER_APPROVE
    }
    resetSerializers()
  })

  function approveOpts(overrides?: Record<string, unknown>) {
    return {
      filePath: join(workDir, 'tests', 'test.spec.ts'),
      testName: 'extensibility-test',
      ...overrides,
    }
  }

  describe('custom comparator', () => {
    it('uses custom comparator to determine match', async () => {
      // Create baseline
      process.env.AVER_APPROVE = '1'
      await approve('Hello World', approveOpts({ name: 'comp' }))

      // Compare with different casing — default would fail
      delete process.env.AVER_APPROVE
      const caseInsensitive = (a: string, b: string) => ({
        equal: a.toLowerCase() === b.toLowerCase(),
      })
      // Should pass because our comparator ignores case
      await approve('hello world', approveOpts({ name: 'comp', comparator: caseInsensitive }))
    })

    it('custom comparator can cause mismatch', async () => {
      // Create baseline
      process.env.AVER_APPROVE = '1'
      await approve('abc', approveOpts({ name: 'comp-fail' }))

      // Compare with same value but strict length comparator that requires different length
      delete process.env.AVER_APPROVE
      const alwaysFail = () => ({ equal: false })
      await expect(
        approve('abc', approveOpts({ name: 'comp-fail', comparator: alwaysFail })),
      ).rejects.toThrow('Approval mismatch')
    })
  })

  describe('custom serializer with normalize', () => {
    it('normalize is applied during comparison', async () => {
      // Register a serializer that normalizes whitespace
      const wsNormSerializer: Serializer = {
        name: 'ws-norm',
        fileExtension: 'txt',
        serialize: (value: unknown) => String(value),
        normalize: (value: string) => value.replace(/\s+/g, ' ').trim(),
      }
      registerSerializer('ws-norm', wsNormSerializer)

      // Create baseline with extra whitespace, using our custom serializer
      process.env.AVER_APPROVE = '1'
      await approve('hello    world', approveOpts({ name: 'norm', serializer: 'ws-norm' }))

      // Compare with different whitespace — should pass because normalize strips it
      delete process.env.AVER_APPROVE
      await approve('hello world', approveOpts({ name: 'norm', serializer: 'ws-norm' }))
    })

    it('normalize on built-in serializer override is applied', async () => {
      // Override built-in text serializer to add normalize
      const textWithNorm: Serializer = {
        name: 'text',
        fileExtension: 'txt',
        serialize: (value: unknown) => String(value),
        normalize: (value: string) => value.toLowerCase(),
      }
      registerSerializer('text', textWithNorm)

      // Create baseline
      process.env.AVER_APPROVE = '1'
      await approve('Hello World', approveOpts({ name: 'norm-override' }))

      // Compare with different casing — should pass because normalize lowercases
      delete process.env.AVER_APPROVE
      await approve('HELLO WORLD', approveOpts({ name: 'norm-override' }))
    })
  })

  describe('SerializerName extensibility', () => {
    it('accepts arbitrary string as serializer name', async () => {
      const yaml: Serializer = {
        name: 'yaml',
        fileExtension: 'yaml',
        serialize: (value: unknown) => `key: ${String(value)}\n`,
      }
      registerSerializer('yaml', yaml)

      process.env.AVER_APPROVE = '1'
      await approve('test-value', approveOpts({ name: 'yaml-test' }))

      const dir = join(workDir, 'tests', '__approvals__', 'extensibility-test')
      // The file should be created (with the text extension since auto-detect picks text for strings)
      expect(existsSync(join(dir, 'yaml-test.approved.txt'))).toBe(true)
    })
  })
})
