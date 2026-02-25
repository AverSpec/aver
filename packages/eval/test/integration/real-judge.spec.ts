import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { setDefaultProvider, resetDefaultProvider, judge } from '../../src/judge.js'
import { agentSdkProvider } from '../../src/providers/agent-sdk.js'

/**
 * Integration tests that call a real LLM judge via the Claude Agent SDK.
 *
 * These tests:
 * 1. Verify the eval pipeline works end-to-end with a real LLM
 * 2. Evaluate the agent's prompt-analysis artifact from the dogfood run
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

  const artifactPath = resolve(__dirname, '../../../../.aver/agent/artifacts/prompt-analysis.md')
  const hasArtifact = existsSync(artifactPath)

  describe.skipIf(!hasArtifact)('dogfood artifact evaluation', () => {
    let artifactContent: string

    beforeAll(() => {
      artifactContent = readFileSync(artifactPath, 'utf-8')
    })

    it('artifact identifies concrete findings with evidence', async () => {
      const rubric =
        'The analysis identifies at least 3 concrete findings about LLM prompt quality, each with evidence from the source code (file paths, line references, or code snippets).'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('artifact provides actionable recommendations', async () => {
      const rubric =
        'The analysis provides specific, actionable recommendations that a developer could implement without further clarification. Recommendations should include what to change and where.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('artifact covers both supervisor and worker prompts', async () => {
      const rubric =
        'The analysis covers BOTH the supervisor prompt (supervisor/prompt.ts) and the worker prompt (worker/prompt.ts), with findings specific to each.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)

    it('artifact identifies the stage-advancement alignment gap', async () => {
      const rubric =
        'The analysis identifies that the supervisor prompt\'s stage advancement criteria do not match the actual verifyAdvancement() hard blocks in the codebase, and flags this as a significant risk.'

      const verdict = await judge(artifactContent, rubric)
      expect(verdict.pass).toBe(true)
      expect(verdict.reasoning).toBeTruthy()
    }, 60_000)
  })
})
