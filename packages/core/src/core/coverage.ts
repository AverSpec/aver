export interface VocabularyCoverage {
  domain: string
  actions: { total: string[]; called: string[] }
  queries: { total: string[]; called: string[] }
  assertions: { total: string[]; called: string[] }
  percentage: number
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
