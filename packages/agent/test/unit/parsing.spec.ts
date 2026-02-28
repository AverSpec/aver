import { describe, it, expect } from 'vitest'
import { extractJson } from '../../src/parsing.js'

describe('extractJson', () => {
  it('extracts from markdown code block', () => {
    const text = 'Here is my response:\n\n```json\n{"key": "value"}\n```\n\nDone.'
    expect(extractJson(text)).toBe('{"key": "value"}')
  })

  it('extracts from code block without json tag', () => {
    const text = '```\n{"key": "value"}\n```'
    expect(extractJson(text)).toBe('{"key": "value"}')
  })

  it('extracts raw JSON from surrounding text', () => {
    const text = 'I think the answer is {"action": {"type": "stop"}} and that is all.'
    expect(extractJson(text)).toBe('{"action": {"type": "stop"}}')
  })

  it('handles curly braces inside JSON string values', () => {
    const json = '{"summary": "Found {3} issues in the {auth} module", "status": "complete"}'
    const text = `Here is my result:\n\n${json}\n\nThat covers everything.`
    const extracted = extractJson(text)
    expect(JSON.parse(extracted)).toEqual({
      summary: 'Found {3} issues in the {auth} module',
      status: 'complete',
    })
  })

  it('handles escaped quotes inside strings', () => {
    const json = '{"summary": "He said \\"hello\\" to {everyone}", "done": true}'
    const text = `Result: ${json}`
    const extracted = extractJson(text)
    expect(JSON.parse(extracted)).toEqual({
      summary: 'He said "hello" to {everyone}',
      done: true,
    })
  })

  it('handles nested objects correctly', () => {
    const json = '{"action": {"type": "dispatch_worker", "worker": {"goal": "test"}}}'
    const text = `Decision:\n${json}\nEnd.`
    const extracted = extractJson(text)
    expect(JSON.parse(extracted)).toEqual({
      action: { type: 'dispatch_worker', worker: { goal: 'test' } },
    })
  })

  it('handles braces in strings within nested objects', () => {
    const json = JSON.stringify({
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'Fix the {config} parser in src/{utils}.ts',
          artifacts: [],
          skill: 'implementation',
        },
      },
      messageToUser: 'Working on {issue #42}',
    })
    const text = `I'll dispatch a worker now.\n\n${json}\n\nLet me know if you need changes.`
    const extracted = extractJson(text)
    expect(JSON.parse(extracted).action.type).toBe('dispatch_worker')
    expect(JSON.parse(extracted).messageToUser).toBe('Working on {issue #42}')
  })

  it('handles empty string values', () => {
    const json = '{"summary": "", "artifacts": []}'
    expect(JSON.parse(extractJson(json))).toEqual({ summary: '', artifacts: [] })
  })

  it('handles backslash-heavy strings', () => {
    const json = '{"path": "C:\\\\Users\\\\test\\\\file.ts", "ok": true}'
    const extracted = extractJson(json)
    expect(JSON.parse(extracted).ok).toBe(true)
  })

  it('returns raw text when no JSON found', () => {
    const text = 'no json here at all'
    expect(extractJson(text)).toBe('no json here at all')
  })

  it('prefers code block over raw brace matching', () => {
    const text = 'Prefix {"wrong": true} then ```json\n{"right": true}\n``` end'
    expect(JSON.parse(extractJson(text))).toEqual({ right: true })
  })

  it('handles string with escaped backslash before quote', () => {
    // The string value ends with a backslash: "path\\"  (escaped backslash, then closing quote)
    const json = '{"value": "path\\\\", "next": true}'
    const extracted = extractJson(`text ${json} more`)
    expect(JSON.parse(extracted).next).toBe(true)
  })

  it('handles empty input string', () => {
    expect(extractJson('')).toBe('')
  })

  it('extracts JSON with multi-line preamble text', () => {
    const text = 'I have decided to stop the session.\n{"action":"stop","reason":"done"}'
    expect(extractJson(text)).toBe('{"action":"stop","reason":"done"}')
  })
})
