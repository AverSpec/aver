import { describe, it, expect, vi } from 'vitest'

// We mock the SDK module so no real subprocess is spawned
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

import { createSdkDispatchers } from '../../src/network/sdk-dispatchers'
import { query } from '@anthropic-ai/claude-agent-sdk'

const mockedQuery = vi.mocked(query)

function makeFakeStream(messages: Array<{ type: string; [key: string]: any }>) {
  return (async function* () {
    for (const msg of messages) yield msg
  })()
}

describe('createSdkDispatchers', () => {
  it('returns an object with supervisorDispatch and workerDispatch', () => {
    const dispatchers = createSdkDispatchers({})
    expect(dispatchers).toHaveProperty('supervisorDispatch')
    expect(dispatchers).toHaveProperty('workerDispatch')
    expect(typeof dispatchers.supervisorDispatch).toBe('function')
    expect(typeof dispatchers.workerDispatch).toBe('function')
  })

  describe('supervisorDispatch', () => {
    it('calls query with system prompt and user prompt', async () => {
      mockedQuery.mockReturnValue(makeFakeStream([
        { type: 'assistant', message: { content: [{ type: 'text', text: '{"action":"stop"}' }] } },
        { type: 'result', subtype: 'success', usage: { input_tokens: 100, output_tokens: 50 } },
      ]))

      const dispatchers = createSdkDispatchers({ claudeExecutablePath: '/usr/bin/claude' })
      const result = await dispatchers.supervisorDispatch('sys prompt', 'user prompt')

      expect(result.response).toBe('{"action":"stop"}')
      expect(result.tokenUsage).toBe(150)
      expect(mockedQuery).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'user prompt',
        options: expect.objectContaining({
          systemPrompt: 'sys prompt',
        }),
      }))
    })

    it('returns empty response when no assistant text', async () => {
      mockedQuery.mockReturnValue(makeFakeStream([
        { type: 'result', subtype: 'success', usage: { input_tokens: 10, output_tokens: 0 } },
      ]))

      const dispatchers = createSdkDispatchers({})
      const result = await dispatchers.supervisorDispatch('sys', 'user')
      expect(result.response).toBe('')
      expect(result.tokenUsage).toBe(10)
    })
  })

  describe('workerDispatch', () => {
    it('collects streamed text from assistant messages', async () => {
      mockedQuery.mockReturnValue(makeFakeStream([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Part 1. ' }] } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Part 2.' }] } },
        { type: 'result', subtype: 'success', usage: { input_tokens: 200, output_tokens: 100 } },
      ]))

      const dispatchers = createSdkDispatchers({})
      const result = await dispatchers.workerDispatch('sys', 'user')
      expect(result.response).toBe('Part 1. Part 2.')
      expect(result.tokenUsage).toBe(300)
    })

    it('throws on SDK error result', async () => {
      mockedQuery.mockReturnValue(makeFakeStream([
        { type: 'result', subtype: 'error', errors: ['Something went wrong'] },
      ]))

      const dispatchers = createSdkDispatchers({})
      await expect(dispatchers.workerDispatch('sys', 'user'))
        .rejects.toThrow('Something went wrong')
    })
  })
})
