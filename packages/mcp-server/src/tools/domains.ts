import { getAdapters } from 'aver'
import type { Domain } from 'aver'

export interface DomainSummary {
  name: string
  actions: string[]
  queries: string[]
  assertions: string[]
  actionCount: number
  queryCount: number
  assertionCount: number
}

export interface DomainVocabulary {
  name: string
  actions: string[]
  queries: string[]
  assertions: string[]
}

export interface AdapterSummary {
  domainName: string
  protocolName: string
}

function getUniqueDomains(): Map<string, Domain> {
  const adapters = getAdapters()
  const domains = new Map<string, Domain>()
  for (const adapter of adapters) {
    if (!domains.has(adapter.domain.name)) {
      domains.set(adapter.domain.name, adapter.domain)
    }
  }
  return domains
}

export function listDomainsHandler(): DomainSummary[] {
  const domains = getUniqueDomains()
  return Array.from(domains.values()).map((domain) => {
    const actions = Object.keys(domain.vocabulary.actions)
    const queries = Object.keys(domain.vocabulary.queries)
    const assertions = Object.keys(domain.vocabulary.assertions)
    return {
      name: domain.name,
      actions,
      queries,
      assertions,
      actionCount: actions.length,
      queryCount: queries.length,
      assertionCount: assertions.length,
    }
  })
}

export function getDomainVocabularyHandler(domainName: string): DomainVocabulary | null {
  const domains = getUniqueDomains()
  const domain = domains.get(domainName)
  if (!domain) return null
  return {
    name: domain.name,
    actions: Object.keys(domain.vocabulary.actions),
    queries: Object.keys(domain.vocabulary.queries),
    assertions: Object.keys(domain.vocabulary.assertions),
  }
}

export function listAdaptersHandler(): AdapterSummary[] {
  return getAdapters().map((adapter) => ({
    domainName: adapter.domain.name,
    protocolName: adapter.protocol.name,
  }))
}
