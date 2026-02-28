import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { setDefaultProvider, resetDefaultProvider, judge } from '../../../src/eval/judge.js'
import { agentSdkProvider } from '../../../src/eval/providers/agent-sdk.js'
import { buildWorkerPrompts } from '../../../src/worker/prompt.js'
import { loadSkill } from '../../../src/worker/skill-loader.js'
import { createSdkDispatchers } from '../../../src/network/sdk-dispatchers.js'

/**
 * Integration tests that call a real LLM judge via the Claude Agent SDK.
 *
 * These tests:
 * 1. Verify the eval pipeline works end-to-end with a real LLM
 * 2. Dispatch a real worker to investigate a target file, then judge the output
 *
 * Requires: Claude Code installed (uses SDK auth, not ANTHROPIC_API_KEY)
 */
describe('real judge pipeline', () => {
  let claudePath: string

  beforeAll(() => {
    try {
      claudePath = execSync('which claude', { encoding: 'utf-8' }).trim()
    } catch {
      throw new Error('Claude Code executable not found. Install Claude Code to run integration tests.')
    }
    setDefaultProvider(agentSdkProvider({ claudeExecutablePath: claudePath }))
  })

  afterAll(() => {
    resetDefaultProvider()
  })

  it('passes content that meets the rubric', async () => {
    const content = `
      ## Investigation Report
      The workspace package has 7 unit tests covering core CRUD operations.
      Missing coverage: no tests for concurrent writes, empty workspace handling, or error recovery.
      Recommendation: Add 3 tests for edge cases in packages/workspace/test/.
    `
    const rubric = 'The output identifies specific missing test coverage and provides actionable recommendations.'

    const verdict = await judge(content, rubric)
    expect(verdict.pass).toBe(true)
    expect(verdict.reasoning).toBeTruthy()
  }, 60_000)

  it('fails content that does not meet the rubric', async () => {
    const content = 'Hello world'
    const rubric = 'The output provides a detailed technical analysis with specific file paths, code examples, and prioritized recommendations.'

    const verdict = await judge(content, rubric)
    expect(verdict.pass).toBe(false)
    expect(verdict.reasoning).toBeTruthy()
  }, 60_000)

  describe('investigation artifact evaluation', () => {
    let artifactContent: string

    beforeAll(async () => {
      const skillResult = await loadSkill('investigation')
      const skillContent = 'content' in skillResult ? skillResult.content : undefined

      const { systemPrompt, userPrompt } = buildWorkerPrompts({
        goal: 'Investigate packages/agent/src/eval/judge.ts — trace code path, identify seams, note constraints, report confidence levels.',
        skill: 'investigation',
        permissionLevel: 'read_only',
        observationBlock: '',
      }, skillContent)

      const dispatchers = createSdkDispatchers({
        claudeExecutablePath: claudePath,
        maxWorkerTurns: 15,
      })
      const result = await dispatchers.workerDispatch(systemPrompt, userPrompt)
      artifactContent = result.response
    }, 300_000)

    it('identifies concrete findings with evidence', async () => {
      const rubric =
        'The analysis identifies at least 2 concrete findings about the code, each with evidence (file paths, line references, or code snippets).'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('provides actionable recommendations', async () => {
      const rubric =
        'The analysis provides specific, actionable recommendations that a developer could implement without further clarification.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('identifies seams for test attachment', async () => {
      const rubric =
        'The analysis identifies at least one seam where tests can attach, describing the seam type and test attachment strategy.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('reports confidence levels', async () => {
      const rubric =
        'Findings include confidence levels (confirmed, inferred, or speculative) as instructed by the investigation skill.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)
  })
})
