import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { setDefaultProvider, resetDefaultProvider, judge } from '../../../src/eval/judge.js'
import { agentSdkProvider } from '../../../src/eval/providers/agent-sdk.js'

/**
 * Eval tests for supervisor revisit decision quality.
 *
 * Each test presents a scenario state and a supervisor decision, then asks
 * the eval judge whether the decision is reasonable. Requires Claude Code auth.
 */
describe('revisit decision quality', () => {
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

  it('judges revisit as reasonable when evidence contradicts specification', async () => {
    const content = `
## Scenario State
- Stage: specified
- Behavior: "User receives email notification within 5 minutes of account creation"
- Rules: ["Email sent via SendGrid API", "Template: welcome-email-v2"]
- Domain operation: UserNotification.sendWelcome

## Worker Report
Investigation found that the SendGrid API was replaced with AWS SES 3 weeks ago.
The welcome email template was renamed to onboarding-v1. The 5-minute SLA is no
longer tracked — emails are sent asynchronously with no timing guarantee.

## Supervisor Decision
{ "action": "revisit_scenario", "scenarioId": "abc123", "targetStage": "characterized", "rationale": "Worker found the underlying email system has fundamentally changed — SendGrid replaced by SES, template renamed, SLA removed. The specification is based on outdated assumptions and needs re-investigation." }
    `
    const rubric = 'The supervisor decision to revisit is reasonable. The evidence clearly contradicts the existing specification (wrong API, wrong template, removed SLA). Revisiting to characterized (not captured) is appropriate because the behavior itself is still relevant, but the technical grounding needs re-investigation.'

    const verdict = await judge(content, rubric)
    expect(verdict.pass).toBe(true)
    expect(verdict.confidence).not.toBe('low')
  }, 60_000)

  it('judges revisit as unreasonable when no evidence of problems', async () => {
    const content = `
## Scenario State
- Stage: mapped
- Behavior: "Admin can deactivate a user account"
- Confirmed by: product-owner
- Rules: ["Deactivated users cannot log in", "Deactivation is reversible"]
- No open questions, no worker reports of issues

## Supervisor Decision
{ "action": "revisit_scenario", "scenarioId": "def456", "targetStage": "captured", "rationale": "I want to revisit this to make sure we haven't missed anything." }
    `
    const rubric = 'The supervisor decision to revisit is unreasonable. There is no evidence of a problem — the scenario has been confirmed by the product owner, has clear rules, and no contradictory evidence. Revisiting to captured (the earliest stage) is especially wasteful as it would require re-confirmation. The rationale is vague and not grounded in evidence.'

    const verdict = await judge(content, rubric)
    expect(verdict.pass).toBe(true)
    expect(verdict.confidence).not.toBe('low')
  }, 60_000)

  it('judges revisit depth as appropriate when targeting nearest relevant stage', async () => {
    const content = `
## Scenario State
- Stage: implemented
- Behavior: "Shopping cart total updates when item quantity changes"
- Domain operation: Cart.updateQuantity
- Test: "cart updates total on quantity change"
- Test result: FAILING — expected total 29.97 but got 30.00 (rounding changed)

## Two Possible Decisions

Decision A (too far):
{ "action": "revisit_scenario", "scenarioId": "ghi789", "targetStage": "captured", "rationale": "Test is failing, need to start over from scratch." }

Decision B (right depth):
{ "action": "revisit_scenario", "scenarioId": "ghi789", "targetStage": "specified", "rationale": "Test failing due to rounding precision mismatch. The specification needs to clarify rounding rules — the behavior and investigation are still valid." }

## Question
Which decision demonstrates better revisit depth?
    `
    const rubric = 'Decision B is the better choice. It targets the nearest stage that addresses the problem (specified) rather than going all the way back to captured. The failing test is a specification-level issue (rounding rules) not a fundamental behavioral issue. Going back to captured would waste all the investigation and confirmation work. The answer should clearly identify Decision B as superior.'

    const verdict = await judge(content, rubric)
    expect(verdict.pass).toBe(true)
    expect(verdict.confidence).not.toBe('low')
  }, 60_000)
})
