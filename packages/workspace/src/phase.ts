import type { Workspace } from './types.js'

export type PhaseName = 'kickoff' | 'investigation' | 'mapping' | 'specification' | 'implementation' | 'verification' | 'discovery'

export interface Phase {
  name: PhaseName
  description: string
  recommendedActions: string[]
}

export function detectPhase(workspace: Workspace): Phase {
  const scenarios = workspace.scenarios
  if (scenarios.length === 0) {
    return {
      name: 'kickoff',
      description: 'Starting a new workflow. Identify the target system and scenario.',
      recommendedActions: [
        'Determine scenario: legacy characterization or new development',
        'Identify the target system',
        'Begin capturing scenarios'
      ]
    }
  }

  const captured = scenarios.filter(s => s.stage === 'captured')
  const characterized = scenarios.filter(s => s.stage === 'characterized')
  const mapped = scenarios.filter(s => s.stage === 'mapped')
  const specified = scenarios.filter(s => s.stage === 'specified')
  const implemented = scenarios.filter(s => s.stage === 'implemented')

  const implementedWithoutLinks = implemented.filter(s => !s.domainOperation)
  const openQuestions = scenarios.flatMap(s => s.questions.filter(q => !q.answer))

  // Discovery loop: new learning happening alongside completed work
  if (captured.length > 0 && implemented.length > 0) {
    return {
      name: 'discovery',
      description: `${captured.length} new captured scenario(s) discovered alongside ${implemented.length} implemented scenario(s). New learning is happening.`,
      recommendedActions: [
        'Investigate newly captured scenarios: trace code paths, find seams',
        'Compare new discoveries against existing implemented scenarios',
        'Advance characterized scenarios with context and rationale',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open question(s)`] : [])
      ]
    }
  }

  // Prioritize earliest unfinished stage — that's where attention is needed
  if (captured.length > 0) {
    return {
      name: 'investigation',
      description: `${captured.length} captured scenario(s) recorded. Continue exploring the system.`,
      recommendedActions: [
        'Explore more system behaviors and capture scenarios',
        'Investigate captured scenarios: trace code paths, find seams',
        'Advance characterized scenarios with context and rationale',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open question(s)`] : [])
      ]
    }
  }

  if (characterized.length > 0) {
    return {
      name: 'mapping',
      description: `${characterized.length} characterized scenario(s) need business confirmation.`,
      recommendedActions: [
        'Review characterized scenarios with business perspective',
        'Confirm: is each behavior intentional or accidental?',
        'Advance confirmed behaviors to mapped',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open question(s)`] : [])
      ]
    }
  }

  if (mapped.length > 0) {
    return {
      name: 'specification',
      description: `${mapped.length} mapped scenario(s) ready for domain vocabulary naming and adapter interface design.`,
      recommendedActions: [
        'Name domain vocabulary (actions, queries, assertions) for each mapped scenario',
        'Define adapter interface signatures',
        'Get human confirmation on vocabulary names before advancing',
        ...(openQuestions.length > 0 ? [`Resolve ${openQuestions.length} open question(s)`] : [])
      ]
    }
  }

  if (specified.length > 0 || implementedWithoutLinks.length > 0) {
    const needingLinks = implementedWithoutLinks.length + specified.length
    return {
      name: 'implementation',
      description: `${needingLinks} scenario(s) need domain vocabulary and adapter implementation.`,
      recommendedActions: [
        'Generate domain definitions from specified scenarios',
        'Write failing tests for each specified behavior',
        'Implement adapter handlers to make tests pass',
        'Run TDD inner loop per protocol'
      ]
    }
  }

  return {
    name: 'verification',
    description: 'All implemented scenarios have domain links. Run full test suite and review coverage.',
    recommendedActions: [
      'Run full test suite across all protocols',
      'Review approval baselines',
      'Check for coverage gaps',
      'Export workspace summary'
    ]
  }
}
