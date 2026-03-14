import type { Domain } from './domain'
import type { CalledOps } from './proxy'
import { getCoverageConfig } from './config'

export interface VocabularyCoverage {
  domain: string
  actions: { total: string[]; called: string[] }
  queries: { total: string[]; called: string[] }
  assertions: { total: string[]; called: string[] }
  percentage: number
}

/**
 * Registers an afterAll hook that enforces vocabulary coverage against the
 * configured threshold. No-ops when no threshold is set or no afterAll is
 * available (e.g. programmatic usage without a test runner).
 */
export function registerCoverageEnforcement(domain: Domain, calledOps: CalledOps): void {
  const globalAfterAll: ((fn: () => void | Promise<void>) => void) | undefined =
    (globalThis as any).afterAll
  const threshold = getCoverageConfig().minPercentage
  if (typeof globalAfterAll === 'function' && threshold > 0) {
    globalAfterAll(() => {
      const cov = computeCoverage(
        domain.name,
        Object.keys(domain.vocabulary.actions),
        Object.keys(domain.vocabulary.queries),
        Object.keys(domain.vocabulary.assertions),
        calledOps.actions,
        calledOps.queries,
        calledOps.assertions,
      )
      if (cov.percentage < threshold) {
        const uncoveredActions = cov.actions.total.filter(n => !cov.actions.called.includes(n))
        const uncoveredQueries = cov.queries.total.filter(n => !cov.queries.called.includes(n))
        const uncoveredAssertions = cov.assertions.total.filter(n => !cov.assertions.called.includes(n))
        const uncoveredParts: string[] = []
        if (uncoveredActions.length > 0) uncoveredParts.push(`actions: ${uncoveredActions.join(', ')}`)
        if (uncoveredQueries.length > 0) uncoveredParts.push(`queries: ${uncoveredQueries.join(', ')}`)
        if (uncoveredAssertions.length > 0) uncoveredParts.push(`assertions: ${uncoveredAssertions.join(', ')}`)
        const detail = uncoveredParts.length > 0 ? ` Uncovered: ${uncoveredParts.join('; ')}.` : ''
        throw new Error(
          `Vocabulary coverage for domain "${domain.name}" is ${cov.percentage}%, ` +
          `below the configured minimum of ${threshold}%.${detail}`,
        )
      }
    })
  }
}

export function computeCoverage(
  domainName: string,
  totalActions: string[],
  totalQueries: string[],
  totalAssertions: string[],
  calledActions: Set<string>,
  calledQueries: Set<string>,
  calledAssertions: Set<string>,
): VocabularyCoverage {
  const total = totalActions.length + totalQueries.length + totalAssertions.length
  const called = calledActions.size + calledQueries.size + calledAssertions.size
  return {
    domain: domainName,
    actions: { total: totalActions, called: [...calledActions] },
    queries: { total: totalQueries, called: [...calledQueries] },
    assertions: { total: totalAssertions, called: [...calledAssertions] },
    percentage: total === 0 ? 100 : Math.round((called / total) * 100),
  }
}
