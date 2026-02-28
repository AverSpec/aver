import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { setDefaultProvider, resetDefaultProvider, judge } from '../../../src/eval/judge.js'
import { agentSdkProvider } from '../../../src/eval/providers/agent-sdk.js'

const DOMAIN_LANGUAGE_RUBRIC =
  'Rules should be business constraints in domain language that a product owner would recognize ' +
  '(e.g., "A task must have a title", "A human must confirm intent before design begins"). ' +
  'Rules must NOT reference implementation details like function names, class names, file paths, ' +
  'variable names, or code constructs (e.g., "Title validation in TaskService.create()", ' +
  '"confirmedBy must be a non-falsy string"). ' +
  'Examples should use Given/When/Then in domain language without code references.'

/**
 * Eval tests for domain language quality in scenario rules and examples.
 *
 * Validates that the judge rubric can distinguish business-level domain language
 * from implementation-level technical language. Requires Claude Code auth.
 */
describe('domain language quality', () => {
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

  it('passes rules and examples written in domain language', async () => {
    const content = `
## Rules
- Scenarios mature through five stages in order: captured, characterized, mapped, specified, implemented
- A human must confirm that an observed behavior reflects their intent before domain design begins
- All questions must be answered before a behavior can be specified
- At least one domain link must exist before a behavior can reach implemented

## Examples
- Given a freshly captured behavior → advance → the scenario moves to characterized, ready for investigation
- Given an investigated behavior with human confirmation → advance → the scenario moves to mapped
- Given a mapped behavior with an unanswered question → advance → blocked until the question is resolved
- Given a specified behavior with no domain link → advance → blocked until linked to domain artifacts
    `

    const verdict = await judge(content, DOMAIN_LANGUAGE_RUBRIC)
    expect(verdict.pass).toBe(true)
  }, 60_000)

  it('fails rules and examples written in implementation language', async () => {
    const content = `
## Rules
- verifyAdvancement() checks confirmedBy field when transitioning characterized → mapped
- WorkspaceOps.advanceScenario() calls store.mutate() for atomic read-modify-write
- confirmedBy must be a non-falsy string for the gate to pass
- questions.filter(q => !q.answer).length must equal 0

## Examples
- Given scenario.stage === 'captured' → call advanceScenario(id, rationale, by) → scenario.stage becomes 'characterized'
- Given !scenario.confirmedBy → advanceScenario throws → error message matches /human confirmation required/
- Given scenario.questions.some(q => !q.answer) → verifyAdvancement returns blocks array with length > 0
    `

    const verdict = await judge(content, DOMAIN_LANGUAGE_RUBRIC)
    expect(verdict.pass).toBe(false)
  }, 60_000)

  it('passes domain concepts that sound technical but are ubiquitous language', async () => {
    const content = `
## Rules
- The maturity pipeline has five stages that must be traversed in order
- Each stage transition creates an audit trail recording who promoted and why
- The human confirmation gate is structural — the system enforces it, not convention

## Examples
- Given an implemented scenario → advance → refused because implemented is the terminal stage
- Given a characterized behavior the product owner reviews → confirm and advance → moves to mapped
- Given a behavior revisited to an earlier stage → previous confirmation is cleared
    `

    const verdict = await judge(content, DOMAIN_LANGUAGE_RUBRIC)
    expect(verdict.pass).toBe(true)
  }, 60_000)
})
