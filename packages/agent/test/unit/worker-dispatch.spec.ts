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
    // read_only should disallow write tools and Bash
    expect(callArgs.options!.disallowedTools).toContain('Edit')
    expect(callArgs.options!.disallowedTools).toContain('Write')
    expect(callArgs.options!.disallowedTools).toContain('Bash')
  })

  it('allows Edit and Write for edit permission level', async () => {
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
    expect(callArgs.options!.disallowedTools).toEqual([])
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
