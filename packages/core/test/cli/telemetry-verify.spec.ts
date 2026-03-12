import { describe, it, expect } from 'vitest'
import { parseVerifyArgs } from '../../src/cli/telemetry'

describe('parseVerifyArgs', () => {
  it('parses --traces flag', () => {
    const args = parseVerifyArgs(['--traces', 'export.json'])
    expect(args.traces).toBe('export.json')
  })

  it('parses --traces= form', () => {
    const args = parseVerifyArgs(['--traces=export.json'])
    expect(args.traces).toBe('export.json')
  })

  it('parses --contract flag', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '--contract', 'c.json'])
    expect(args.contract).toBe('c.json')
  })

  it('parses --verbose flag', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '--verbose'])
    expect(args.verbose).toBe(true)
  })

  it('parses -v shorthand', () => {
    const args = parseVerifyArgs(['--traces', 'x.json', '-v'])
    expect(args.verbose).toBe(true)
  })

  it('defaults verbose to false', () => {
    const args = parseVerifyArgs(['--traces', 'x.json'])
    expect(args.verbose).toBe(false)
  })
})
