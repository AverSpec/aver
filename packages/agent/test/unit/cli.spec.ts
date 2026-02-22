import { describe, it, expect } from 'vitest'
import { parseAgentArgs } from '../../src/cli.js'

describe('parseAgentArgs', () => {
  it('parses start with goal', () => {
    const result = parseAgentArgs(['start', 'add task cancellation'])
    expect(result.command).toBe('start')
    expect(result.goal).toBe('add task cancellation')
  })

  it('parses start with multi-word goal', () => {
    const result = parseAgentArgs(['start', 'add', 'task', 'cancellation'])
    expect(result.command).toBe('start')
    expect(result.goal).toBe('add task cancellation')
  })

  it('parses start without goal', () => {
    const result = parseAgentArgs(['start'])
    expect(result.command).toBe('start')
    expect(result.goal).toBeUndefined()
  })

  it('parses status', () => {
    const result = parseAgentArgs(['status'])
    expect(result.command).toBe('status')
  })

  it('parses stop', () => {
    const result = parseAgentArgs(['stop'])
    expect(result.command).toBe('stop')
  })

  it('parses log', () => {
    const result = parseAgentArgs(['log'])
    expect(result.command).toBe('log')
  })

  it('parses dashboard', () => {
    const result = parseAgentArgs(['dashboard'])
    expect(result.command).toBe('dashboard')
  })

  it('returns help for unknown command', () => {
    const result = parseAgentArgs(['unknown'])
    expect(result.command).toBe('help')
  })

  it('returns help for empty args', () => {
    const result = parseAgentArgs([])
    expect(result.command).toBe('help')
  })

  it('returns help for --help flag', () => {
    const result = parseAgentArgs(['--help'])
    expect(result.command).toBe('help')
  })

  it('returns help for -h flag', () => {
    const result = parseAgentArgs(['-h'])
    expect(result.command).toBe('help')
  })
})
