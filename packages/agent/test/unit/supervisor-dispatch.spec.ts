import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupervisorInput, AgentConfig } from '../../src/types.js'

// Mock the Agent SDK before importing dispatch
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Import after mock
const { query } = await import('@anthropic-ai/claude-agent-sdk')
const { dispatchSupervisor } = await import('../../src/supervisor/dispatch.js')
const mockQuery = vi.mocked(query)

describe('dispatchSupervisor', () => {
  const baseInput: SupervisorInput = {
    trigger: 'startup',
    projectContext: '',
    workspace: { projectId: 'test', scenarios: [], createdAt: '', updatedAt: '' },
    checkpointChain: [],
    recentEvents: [],
    storySummaries: [],
    artifactIndex: [],
  }

  const config: AgentConfig = {
    model: { supervisor: 'claude-sonnet-4-5-20250929', worker: 'claude-opus-4-6' },
    cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
    dashboard: { port: 4700 },
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls query with correct model and system prompt', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"no scenarios"}}'),
      successResult(100, 50),
    ]))

    await dispatchSupervisor(baseInput, config)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
          allowedTools: [],
          maxTurns: 1,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
        }),
      }),
    )
  })

  it('passes supervisor prompt as systemPrompt and user prompt as prompt', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"done"}}'),
      successResult(100, 50),
    ]))

    await dispatchSupervisor(baseInput, config)

    const call = mockQuery.mock.calls[0][0]
    expect(call.prompt).toContain('Trigger: startup')
    expect(call.options?.systemPrompt).toContain('supervisor')
  })

  it('parses stop decision from assistant response', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"no scenarios"}}'),
      successResult(100, 50),
    ]))

    const result = await dispatchSupervisor(baseInput, config)
    expect(result.decision.action.type).toBe('stop')
  })

  it('parses dispatch_worker decision', async () => {
    const decision = JSON.stringify({
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate auth module',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: true,
          permissionLevel: 'read_only',
        },
      },
      messageToUser: 'Starting investigation',
    })
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage(decision),
      successResult(200, 100),
    ]))

    const result = await dispatchSupervisor(baseInput, config)
    expect(result.decision.action.type).toBe('dispatch_worker')
    expect(result.decision.messageToUser).toBe('Starting investigation')
  })

  it('sums input and output tokens for tokenUsage', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"done"}}'),
      successResult(250, 75),
    ]))

    const result = await dispatchSupervisor(baseInput, config)
    expect(result.tokenUsage).toBe(325)
  })

  it('concatenates text from multiple content blocks', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      {
        type: 'assistant' as const,
        message: {
          content: [
            { type: 'text' as const, text: '{"action":{"type":"stop",' },
            { type: 'text' as const, text: '"reason":"multi-block"}}' },
          ],
        },
        uuid: '00000000-0000-0000-0000-000000000001',
        session_id: 's1',
        parent_tool_use_id: null,
      },
      successResult(100, 50),
    ]))

    const result = await dispatchSupervisor(baseInput, config)
    expect(result.decision.action.type).toBe('stop')
  })

  it('reports zero tokens when no result message arrives', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"no result"}}'),
    ]))

    const result = await dispatchSupervisor(baseInput, config)
    expect(result.tokenUsage).toBe(0)
  })

  it('throws when assistant text is not valid decision JSON', async () => {
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('I am not sure what to do'),
      successResult(100, 50),
    ]))

    await expect(dispatchSupervisor(baseInput, config)).rejects.toThrow()
  })

  it('uses different model when config changes', async () => {
    const altConfig: AgentConfig = {
      ...config,
      model: { supervisor: 'claude-opus-4-6', worker: 'claude-opus-4-6' },
    }
    mockQuery.mockReturnValue(createMockQuery([
      assistantMessage('{"action":{"type":"stop","reason":"done"}}'),
      successResult(100, 50),
    ]))

    await dispatchSupervisor(baseInput, altConfig)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: 'claude-opus-4-6',
        }),
      }),
    )
  })
})

// --- Helpers ---

function assistantMessage(text: string): any {
  return {
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
    uuid: '00000000-0000-0000-0000-000000000001',
    session_id: 's1',
    parent_tool_use_id: null,
  }
}

function successResult(inputTokens: number, outputTokens: number): any {
  return {
    type: 'result',
    subtype: 'success',
    result: '',
    total_cost_usd: 0.001,
    is_error: false,
    num_turns: 1,
    duration_ms: 100,
    duration_api_ms: 80,
    stop_reason: 'end_turn',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: '00000000-0000-0000-0000-000000000002',
    session_id: 's1',
  }
}

function createMockQuery(messages: any[]): any {
  const gen = (async function* () {
    for (const msg of messages) yield msg
  })()
  // Stub methods that the Query interface requires
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
