import { getAdapters, getDomains } from '@aver/core'
import type { Domain } from '@aver/core'
import { scanAdapterFiles, matchDomainByKebab } from '../discovery.js'
import { getProjectRoot } from '../config.js'

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
  filePath?: string
}

function getUniqueDomains(): Map<string, Domain> {
  const domains = new Map<string, Domain>()

  // Primary source: domain registry (populated by discovery or registerAdapter)
  for (const domain of getDomains()) {
    if (!domains.has(domain.name)) {
      domains.set(domain.name, domain)
    }
  }

  // Fallback: extract from adapter registry (backward compat)
  if (domains.size === 0) {
    for (const adapter of getAdapters()) {
      if (!domains.has(adapter.domain.name)) {
        domains.set(adapter.domain.name, adapter.domain)
      }
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

export async function listAdaptersHandler(): Promise<AdapterSummary[]> {
  // Try adapter registry first (populated when config imports work)
  const adapters = getAdapters()
  if (adapters.length > 0) {
    return adapters.map((adapter) => ({
      domainName: adapter.domain.name,
      protocolName: adapter.protocol.name,
    }))
  }

  // Fall back to filesystem scan
  const root = getProjectRoot()
  if (!root) return []

  const files = await scanAdapterFiles(root)
  const domains = getDomains()
  return files.map((f) => {
    const domain = matchDomainByKebab(f.domainKebab, domains)
    return {
      domainName: domain?.name ?? f.domainKebab,
      protocolName: f.protocol,
      filePath: f.filePath,
    }
  })
}
