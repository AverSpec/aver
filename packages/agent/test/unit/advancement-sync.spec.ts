/**
 * Advancement synchronization test — P1-3
 *
 * `verifyAdvancement()` in @aver/workspace is the single source of truth for
 * hard block conditions. The supervisor prompt must reference every one of those
 * conditions so the LLM knows what prerequisites to satisfy before calling
 * `update_workspace`.
 *
 * This test derives the hard block messages directly from `verifyAdvancement()`
 * and then checks that the key terms from each message appear in the supervisor
 * prompt system text. If the hard blocks ever change in workspace, this test
 * will fail here in agent — forcing the prompt to be updated in sync.
 */
import { describe, it, expect } from 'vitest'
import { verifyAdvancement } from '../../src/shell/verification.js'
import { buildSupervisorPrompt } from '../../src/supervisor/prompt.js'
import type { Scenario } from '@aver/workspace'
import type { SupervisorInput } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc-sync',
    stage: 'captured',
    behavior: 'synchronization test scenario',
    rules: [],
    examples: [],
    questions: [],
    constraints: [],
    seams: [],
    transitions: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

const baseInput: SupervisorInput = {
  trigger: 'startup',
  projectContext: '',
  workspace: { projectId: 'sync-test', scenarios: [], createdAt: '', updatedAt: '' },
  checkpointChain: [],
  recentEvents: [],
  storySummaries: [],
  artifactIndex: [],
}

/**
 * Extract significant camelCase identifiers and domain-specific multi-word phrases
 * from a hard block message. We look for:
 *   - camelCase tokens (field names like confirmedBy, domainOperation, testNames)
 *   - the phrase "open question" as a concept
 *
 * Generic words like "links", "mapped", "required" are excluded because they
 * are too common to reliably appear verbatim in prompt text.
 */
function extractKeyTerms(hardBlockMessage: string): string[] {
  const terms: string[] = []

  // Pick up camelCase identifiers (e.g. confirmedBy, domainOperation, testNames)
  const camelCaseRe = /\b[a-z]+[A-Z][a-zA-Z]+\b/g
  const camelMatches = hardBlockMessage.match(camelCaseRe) ?? []
  terms.push(...camelMatches.map(t => t.toLowerCase()))

  // Pick up "open question" as a domain concept phrase (case-insensitive)
  if (/open question/i.test(hardBlockMessage)) {
    terms.push('open question')
  }

  return [...new Set(terms)]
}

// ---------------------------------------------------------------------------
// Hard block scenarios — one per transition that verifyAdvancement guards
// ---------------------------------------------------------------------------

/**
 * characterized -> mapped: confirmedBy required
 */
const characterizedNoConfirmedBy = makeScenario({
  stage: 'characterized',
  // confirmedBy intentionally absent
})

/**
 * mapped -> specified: open questions must be resolved
 */
const mappedWithOpenQuestion = makeScenario({
  stage: 'mapped',
  questions: [{ id: 'q1', text: 'Unresolved question' }],
})

/**
 * specified -> implemented: domain links required
 */
const specifiedNoDomainLinks = makeScenario({
  stage: 'specified',
  // domainOperation and testNames intentionally absent
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('advancement synchronization: supervisor prompt vs verifyAdvancement', () => {
  const { system } = buildSupervisorPrompt(baseInput)
  const systemLower = system.toLowerCase()

  it('verifyAdvancement hard blocks are consistent with test fixtures (guard rails)', () => {
    // Confirm our fixtures actually trigger hard blocks so the sync test is meaningful.
    expect(verifyAdvancement(characterizedNoConfirmedBy, 'characterized', 'mapped').blocked).toBe(true)
    expect(verifyAdvancement(mappedWithOpenQuestion, 'mapped', 'specified').blocked).toBe(true)
    expect(verifyAdvancement(specifiedNoDomainLinks, 'specified', 'implemented').blocked).toBe(true)
  })

  it('supervisor prompt mentions the confirmedBy prerequisite (characterized->mapped hard block)', () => {
    const [block] = verifyAdvancement(characterizedNoConfirmedBy, 'characterized', 'mapped').hardBlocks
    // The hard block message contains "confirmedBy" — the prompt must reference it.
    expect(block).toContain('confirmedBy')
    expect(system).toContain('confirmedBy')
  })

  it('supervisor prompt mentions the open questions prerequisite (mapped->specified hard block)', () => {
    const [block] = verifyAdvancement(mappedWithOpenQuestion, 'mapped', 'specified').hardBlocks
    // The hard block message contains "open question" — the prompt must acknowledge it.
    expect(block).toMatch(/open question/i)
    expect(systemLower).toMatch(/open questions?\s+must\s+be\s+resolved|all open questions must/i)
  })

  it('supervisor prompt mentions the domain links prerequisite (specified->implemented hard block)', () => {
    const [block] = verifyAdvancement(specifiedNoDomainLinks, 'specified', 'implemented').hardBlocks
    // The hard block message contains "domainOperation" and "testNames" — the prompt must reference them.
    expect(block).toContain('domainOperation')
    expect(block).toContain('testNames')
    expect(system).toContain('domainOperation')
    expect(system).toContain('testNames')
  })

  it('all hard block key terms from verifyAdvancement appear in the supervisor prompt', () => {
    const hardBlockCases: Array<{ scenario: Scenario; from: Scenario['stage']; to: Scenario['stage'] }> = [
      { scenario: characterizedNoConfirmedBy, from: 'characterized', to: 'mapped' },
      { scenario: mappedWithOpenQuestion, from: 'mapped', to: 'specified' },
      { scenario: specifiedNoDomainLinks, from: 'specified', to: 'implemented' },
    ]

    for (const { scenario, from, to } of hardBlockCases) {
      const { hardBlocks } = verifyAdvancement(scenario, from, to)
      for (const blockMsg of hardBlocks) {
        const keyTerms = extractKeyTerms(blockMsg)
        for (const term of keyTerms) {
          expect(
            systemLower,
            `Supervisor prompt is missing key term "${term}" from hard block "${blockMsg}" (${from}->${to})`,
          ).toContain(term)
        }
      }
    }
  })

  it('supervisor prompt covers all three hard block transition pairs', () => {
    // Each transition's prerequisite stage and target stage should be named
    // in context of advancement to confirm the prompt is stage-aware.
    expect(system).toContain('characterized')
    expect(system).toContain('mapped')
    expect(system).toContain('specified')
    expect(system).toContain('implemented')
  })
})
