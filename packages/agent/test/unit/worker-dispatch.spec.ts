import { describe, it, expect, vi, afterEach } from 'vitest'
import type { WorkerDispatch, AgentConfig } from '../../src/types.js'

// Mock the Agent SDK before importing dispatch
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

const { query } = await import('@anthropic-ai/claude-agent-sdk')
const { dispatchWorker, buildWorkerPrompts } = await import('../../src/worker/dispatch.js')
const mockQuery = vi.mocked(query)

describe('buildWorkerPrompts', () => {
  it('returns systemPrompt and userPrompt', () => {
    const { systemPrompt, userPrompt } = buildWorkerPrompts({
      goal: 'Investigate auth',
      observationBlock: 'Previous findings here',
      permissionLevel: 'read_only',
      skill: 'investigation',
    })
    expect(systemPrompt).toContain('focused execution agent')
    expect(systemPrompt).toContain('STATUS: complete')
    expect(userPrompt).toContain('Investigate auth')
    expect(userPrompt).toContain('Previous findings here')
  })

  it('includes scenario detail when provided', () => {
    const { userPrompt } = buildWorkerPrompts({
      goal: 'Implement feature',
      observationBlock: '',
      permissionLevel: 'edit',
      skill: 'implementation',
      scenarioDetail: { id: 'sc-1', name: 'login flow', stage: 'specified' },
    })
    expect(userPrompt).toContain('login flow')
    expect(userPrompt).toContain('sc-1')
  })
})

describe('dispatchWorker', () => {
  const config: AgentConfig = {
    model: { supervisor: 'claude-sonnet-4-5-20250929', worker: 'claude-opus-4-6' },
    cycles: { checkpointInterval: 10, rollupThreshold: 3 },
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

  it('calls query with worker model and returns raw text as summary', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Found 3 seams in the auth module.\n\nSTATUS: complete' },
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
    expect(result.result.summary).toContain('Found 3 seams')
    expect(result.result.status).toBe('complete')
    expect(result.tokenUsage).toBe(3000)

    const callArgs = mockQuery.mock.calls[0][0]
    expect(callArgs.options!.model).toBe('claude-opus-4-6')
    // read_only should disallow write tools, Bash, and Task
    expect(callArgs.options!.disallowedTools).toContain('Edit')
    expect(callArgs.options!.disallowedTools).toContain('Write')
    expect(callArgs.options!.disallowedTools).toContain('Bash')
    expect(callArgs.options!.disallowedTools).toContain('Task')
    // approval hook should be wired in
    expect(callArgs.options!.canUseTool).toBeTypeOf('function')
  })

  it('extracts stuck status from worker output', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Cannot find the module.\n\nSTATUS: stuck' }],
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
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: '00000000-0000-0000-0000-000000000002',
          session_id: 's1',
        },
      ]),
    )

    const result = await dispatchWorker(dispatch, [], config)
    expect(result.result.status).toBe('stuck')
  })

  it('treats STATUS: continue as stuck (needs more work)', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Making progress.\n\nSTATUS: continue' }],
          },
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
          duration_ms: 10,
          duration_api_ms: 8,
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: '00000000-0000-0000-0000-000000000002',
          session_id: 's1',
        },
      ]),
    )

    const result = await dispatchWorker(dispatch, [], config)
    expect(result.result.status).toBe('stuck')
  })

  it('allows Edit and Write but disallows Task for edit permission level', async () => {
    const editDispatch = { ...dispatch, permissionLevel: 'edit' as const, skill: 'implementation' }
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Done.\n\nSTATUS: complete' }],
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

  it('throws when total timeout elapses before query completes', async () => {
    mockQuery.mockReturnValue(createHangingQuery())

    const fastConfig: AgentConfig = {
      ...config,
      timeouts: { workerTurnMs: 5_000, workerTotalMs: 50 },
    }

    await expect(dispatchWorker(dispatch, [], fastConfig)).rejects.toThrow(
      /timed?\s*out/i,
    )
  }, 3_000)

  it('throws when per-turn timeout elapses on a stalled turn', async () => {
    mockQuery.mockReturnValue(createHangingQuery())

    const fastConfig: AgentConfig = {
      ...config,
      timeouts: { workerTurnMs: 50, workerTotalMs: 10_000 },
    }

    await expect(dispatchWorker(dispatch, [], fastConfig)).rejects.toThrow(
      /timed?\s*out/i,
    )
  }, 3_000)

  it('canUseTool hook enforces permission level', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'ok\n\nSTATUS: complete' }] },
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
      { type: 'assistant', message: { content: [{ type: 'text', text: 'ok\n\nSTATUS: complete' }] }, uuid: '1', session_id: 's1', parent_tool_use_id: null },
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

/**
 * Returns a mock query whose async iterator never resolves — simulating a
 * completely hung SDK call (e.g., network stall before the first byte).
 */
function createHangingQuery(): any {
  const gen = (async function* () {
    await new Promise<never>(() => {})
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
