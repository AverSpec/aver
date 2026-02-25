import { describe, it, expect, vi, afterEach } from 'vitest'
import type { WorkerDispatch, AgentConfig } from '../../src/types.js'

// Mock the Agent SDK before importing dispatch
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

const { query } = await import('@anthropic-ai/claude-agent-sdk')
const { dispatchWorker } = await import('../../src/worker/dispatch.js')
const mockQuery = vi.mocked(query)

describe('dispatchWorker', () => {
  const config: AgentConfig = {
    model: { supervisor: 'claude-sonnet-4-5-20250929', worker: 'claude-opus-4-6' },
    cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
    dashboard: { port: 4700 },
  }

  const dispatch: WorkerDispatch = {
    goal: 'Investigate auth module',
    artifacts: [],
    skill: 'investigation',
    allowUserQuestions: false,
    permissionLevel: 'read_only',
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls query with worker model and parses result', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '```json\n{"summary":"found seams","artifacts":[]}\n```' },
            ],
          },
          uuid: '00000000-0000-0000-0000-000000000001',
          session_id: 's1',
          parent_tool_use_id: null,
        },
        {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0.1,
          is_error: false,
          num_turns: 5,
          duration_ms: 5000,
          duration_api_ms: 4000,
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 2000,
            output_tokens: 1000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: '00000000-0000-0000-0000-000000000002',
          session_id: 's1',
        },
      ]),
    )

    const result = await dispatchWorker(dispatch, [], config)
    expect(result.result.summary).toBe('found seams')
    expect(result.tokenUsage).toBe(3000)

    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options!.model).toBe('claude-opus-4-6')
    // read_only should disallow write tools, Bash, and Task
    expect(callArgs.options!.disallowedTools).toContain('Edit')
    expect(callArgs.options!.disallowedTools).toContain('Write')
    expect(callArgs.options!.disallowedTools).toContain('Bash')
    expect(callArgs.options!.disallowedTools).toContain('Task')
    // approval hook should be wired in, bypassPermissions should NOT be set
    expect(callArgs.options!.canUseTool).toBeTypeOf('function')
    expect(callArgs.options!.permissionMode).toBeUndefined()
  })

  it('allows Edit and Write but disallows Task for edit permission level', async () => {
    const editDispatch = { ...dispatch, permissionLevel: 'edit' as const, skill: 'tdd-loop' }
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '{"summary":"done","artifacts":[]}' }],
          },
          uuid: '00000000-0000-0000-0000-000000000001',
          session_id: 's1',
          parent_tool_use_id: null,
        },
        {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0.1,
          is_error: false,
          num_turns: 5,
          duration_ms: 5000,
          duration_api_ms: 4000,
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 2000,
            output_tokens: 1000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: '00000000-0000-0000-0000-000000000002',
          session_id: 's1',
        },
      ]),
    )

    await dispatchWorker(editDispatch, [], config)
    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options!.disallowedTools).toEqual(['Task'])
  })

  it('canUseTool hook enforces permission level', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: '{"summary":"ok","artifacts":[]}' }] },
          uuid: '00000000-0000-0000-0000-000000000001',
          session_id: 's1',
          parent_tool_use_id: null,
        },
        {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0,
          is_error: false,
          num_turns: 1,
          duration_ms: 1000,
          duration_api_ms: 900,
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: '00000000-0000-0000-0000-000000000002',
          session_id: 's1',
        },
      ]),
    )

    // read_only dispatch
    await dispatchWorker(dispatch, [], config)
    const canUseTool = mockQuery.mock.calls[0][0].options!.canUseTool as Function
    const signal = new AbortController().signal

    // Read tools should be allowed
    expect(await canUseTool('Read', {}, { signal })).toEqual({ behavior: 'allow' })
    expect(await canUseTool('Glob', {}, { signal })).toEqual({ behavior: 'allow' })

    // Write tools should be denied in read_only
    const editResult = await canUseTool('Edit', {}, { signal })
    expect(editResult.behavior).toBe('deny')

    // Bash should be denied in read_only
    const bashResult = await canUseTool('Bash', { command: 'ls' }, { signal })
    expect(bashResult.behavior).toBe('deny')

    // Sensitive commands denied even in full mode
    mockQuery.mockReturnValue(createMockQuery([
      { type: 'assistant', message: { content: [{ type: 'text', text: '{"summary":"ok","artifacts":[]}' }] }, uuid: '1', session_id: 's1', parent_tool_use_id: null },
      { type: 'result', subtype: 'success', result: '', total_cost_usd: 0, is_error: false, num_turns: 1, duration_ms: 1000, duration_api_ms: 900, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: {}, permission_denials: [], uuid: '2', session_id: 's1' },
    ]))
    const fullDispatch = { ...dispatch, permissionLevel: 'full' as const }
    await dispatchWorker(fullDispatch, [], config)
    const fullCanUseTool = mockQuery.mock.calls[1][0].options!.canUseTool as Function

    // Safe bash allowed in full
    expect(await fullCanUseTool('Bash', { command: 'ls' }, { signal })).toEqual({ behavior: 'allow' })
    // Sensitive bash denied (non-interactive agent denies by default)
    const pushResult = await fullCanUseTool('Bash', { command: 'git push origin main' }, { signal })
    expect(pushResult.behavior).toBe('deny')
  })
})

function createMockQuery(messages: any[]): any {
  const gen = (async function* () {
    for (const msg of messages) yield msg
  })()
  gen.interrupt = async () => {}
  gen.setPermissionMode = async () => {}
  gen.setModel = async () => {}
  gen.setMaxThinkingTokens = async () => {}
  gen.initializationResult = async () => ({})
  gen.supportedCommands = async () => []
  gen.supportedModels = async () => []
  gen.mcpServerStatus = async () => []
  gen.accountInfo = async () => ({})
  gen.rewindFiles = async () => ({ canRewind: false })
  gen.reconnectMcpServer = async () => {}
  gen.toggleMcpServer = async () => {}
  gen.setMcpServers = async () => ({ added: [], removed: [], errors: {} })
  gen.streamInput = async () => {}
  gen.stopTask = async () => {}
  gen.close = () => {}
  return gen
}
