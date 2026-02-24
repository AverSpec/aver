import type { Scenario, Stage } from '@aver/workspace'

export interface AdvancementResult {
  blocked: boolean
  reason?: string
  warning?: string
}

export function verifyAdvancement(scenario: Scenario, targetStage: Stage): AdvancementResult {
  // Hard block: mapped -> specified with open questions
  if (scenario.stage === 'mapped' && targetStage === 'specified') {
    const openQuestions = scenario.questions.filter((q) => !q.answer)
    if (openQuestions.length > 0) {
      return {
        blocked: true,
        reason: `Cannot advance to specified: ${openQuestions.length} open questions must be resolved first`,
      }
    }
  }

  // Hard block: specified -> implemented without domain links
  if (scenario.stage === 'specified' && targetStage === 'implemented') {
    const hasDomainLinks = !!(scenario.domainOperation || (scenario.testNames && scenario.testNames.length > 0))
    if (!hasDomainLinks) {
      return {
        blocked: true,
        reason: 'Cannot advance to implemented: no domain links (domainOperation or testNames required)',
      }
    }
  }

  // Conditional warning: captured -> characterized for observed mode without evidence
  if (scenario.stage === 'captured' && targetStage === 'characterized') {
    if (scenario.mode === 'observed') {
      const hasEvidence = scenario.seams.length > 0 || scenario.constraints.length > 0
      if (!hasEvidence) {
        return {
          blocked: false,
          warning: 'Advancing with no investigation evidence (no seams or constraints identified)',
        }
      }
    }
  }

  return { blocked: false }
}
