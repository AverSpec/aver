import type { Workspace } from './types.js'

export type PhaseName = 'kickoff' | 'discovery' | 'mapping' | 'formalization' | 'implementation' | 'verification'

export interface Phase {
  name: PhaseName
  description: string
  recommendedActions: string[]
}

export function detectPhase(workspace: Workspace): Phase {
  const items = workspace.items
  if (items.length === 0) {
    return {
      name: 'kickoff',
      description: 'Starting a new workflow. Identify the target system and scenario.',
      recommendedActions: [
        'Determine scenario: legacy characterization or new development',
        'Identify the target system',
        'Begin recording observations or intents'
      ]
    }
  }

  const observed = items.filter(i => i.stage === 'observed')
  const explored = items.filter(i => i.stage === 'explored')
  const intended = items.filter(i => i.stage === 'intended')
  const formalized = items.filter(i => i.stage === 'formalized')

  const formalizedWithoutLinks = formalized.filter(i => !i.domainOperation)
  const openQuestions = items.flatMap(i => i.questions.filter(q => !q.answer))

  // Work backward from most mature state
  if (formalized.length > 0 && formalizedWithoutLinks.length === 0) {
    return {
      name: 'verification',
      description: 'All formalized items have domain links. Run full test suite and review coverage.',
      recommendedActions: [
        'Run full test suite across all protocols',
        'Review approval baselines',
        'Check for coverage gaps',
        'Export workspace summary'
      ]
    }
  }

  if (formalized.length > 0 || (intended.length > 0 && intended.some(i => i.examples.length > 0))) {
    return {
      name: 'implementation',
      description: `${formalizedWithoutLinks.length} formalized items need domain vocabulary and adapter implementation.`,
      recommendedActions: [
        'Generate domain definitions from formalized items',
        'Write failing tests for each formalized behavior',
        'Implement adapter handlers to make tests pass',
        'Run TDD inner loop per protocol'
      ]
    }
  }

  if (intended.length > 0) {
    return {
      name: 'formalization',
      description: `${intended.length} intended items ready for Example Mapping and test generation.`,
      recommendedActions: [
        'Run Example Mapping for each intended item',
        'Generate concrete examples from rules',
        'Promote to formalized when examples are complete',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open questions`] : [])
      ]
    }
  }

  if (explored.length > 0) {
    return {
      name: 'mapping',
      description: `${explored.length} explored items need business confirmation.`,
      recommendedActions: [
        'Review explored items with business perspective',
        'Confirm: is each behavior intentional or accidental?',
        'Promote confirmed behaviors to intended',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open questions`] : [])
      ]
    }
  }

  return {
    name: 'discovery',
    description: `${observed.length} observations recorded. Continue exploring the system.`,
    recommendedActions: [
      'Explore more system behaviors and record observations',
      'Investigate observed items: trace code paths, find seams',
      'Promote explored items with context and rationale',
      ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open questions`] : [])
    ]
  }
}
