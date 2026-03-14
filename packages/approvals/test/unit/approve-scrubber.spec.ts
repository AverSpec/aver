import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../src/approve'

describe('approve() scrubber', () => {
  let workDir: string
  let savedApprove: string | undefined

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aver-scrub-test-'))
    savedApprove = process.env.AVER_APPROVE
  })

  afterEach(() => {
    if (savedApprove !== undefined) {
      process.env.AVER_APPROVE = savedApprove
    } else {
      delete process.env.AVER_APPROVE
    }
  })

  function approveOpts(overrides?: Record<string, unknown>) {
    return {
      filePath: join(workDir, 'tests', 'test.spec.ts'),
      testName: 'scrubber-test',
      ...overrides,
    }
  }

  function readApproved(name: string, ext = 'txt'): string {
    const dir = join(workDir, 'tests', '__approvals__', 'scrubber-test')
    return readFileSync(join(dir, `${name}.approved.${ext}`), 'utf-8')
  }

  it('replaces UUIDs with placeholder using rule array', async () => {
    process.env.AVER_APPROVE = '1'
    await approve('Order a3f7b2c1-9d4e-4a1b-8c3d-1234567890ab confirmed', approveOpts({
      name: 'uuid',
      scrub: [
        { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, replacement: '[UUID]' },
      ],
    }))

    expect(readApproved('uuid')).toBe('Order [UUID] confirmed')
  })

  it('applies multiple rules in order', async () => {
    process.env.AVER_APPROVE = '1'
    await approve('Created 2026-03-13 on port 54321', approveOpts({
      name: 'multi',
      scrub: [
        { pattern: /\d{4}-\d{2}-\d{2}/g, replacement: '[DATE]' },
        { pattern: /port \d+/g, replacement: 'port [PORT]' },
      ],
    }))

    expect(readApproved('multi')).toBe('Created [DATE] on port [PORT]')
  })

  it('accepts a function scrubber', async () => {
    process.env.AVER_APPROVE = '1'
    await approve('Token: eyJhbGci.payload.signature', approveOpts({
      name: 'fn',
      scrub: (text) => text.replace(/eyJ[\w.]+/g, '[JWT]'),
    }))

    expect(readApproved('fn')).toBe('Token: [JWT]')
  })

  it('scrubbed value is stable across runs', async () => {
    const scrub = [
      { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, replacement: '[UUID]' },
    ] as const

    // Create baseline with one UUID
    process.env.AVER_APPROVE = '1'
    await approve('id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', approveOpts({ name: 'stable', scrub }))

    // Verify with a different UUID — should pass because both scrub to [UUID]
    delete process.env.AVER_APPROVE
    await approve('id: 11111111-2222-3333-4444-555555555555', approveOpts({ name: 'stable', scrub }))
  })

  it('works with JSON serializer', async () => {
    process.env.AVER_APPROVE = '1'
    await approve({ id: 'abc-123', timestamp: '2026-03-13T20:55:00Z' }, approveOpts({
      name: 'json',
      scrub: [
        { pattern: /\d{4}-\d{2}-\d{2}T[\d:]+Z/g, replacement: '[TIMESTAMP]' },
      ],
    }))

    const content = readApproved('json', 'json')
    expect(content).toContain('[TIMESTAMP]')
    expect(content).not.toContain('2026')
  })
})
