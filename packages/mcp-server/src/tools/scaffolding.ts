import { _getAdapters } from 'aver'

export interface DomainStructure {
  suggestedName: string
  actions: Array<{ name: string; payloadDescription: string }>
  queries: Array<{ name: string; returnDescription: string }>
  assertions: Array<{ name: string; payloadDescription: string }>
}

export interface AdapterStructure {
  domain: string
  protocol: string
  handlers: {
    actions: string[]
    queries: string[]
    assertions: string[]
  }
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

export function describeDomainStructureHandler(description: string): DomainStructure {
  const suggestedName = toCamelCase(description)

  return {
    suggestedName,
    actions: [
      { name: 'create', payloadDescription: 'data to create the resource' },
      { name: 'update', payloadDescription: 'fields to update' },
      { name: 'delete', payloadDescription: 'none' },
    ],
    queries: [
      { name: 'getAll', returnDescription: 'list of resources' },
      { name: 'getById', returnDescription: 'single resource' },
    ],
    assertions: [
      { name: 'exists', payloadDescription: 'identifier' },
      { name: 'hasCount', payloadDescription: 'expected count' },
    ],
  }
}

export function describeAdapterStructureHandler(
  domainName: string,
  protocolName: string,
): AdapterStructure | null {
  const adapters = _getAdapters()
  const adapter = adapters.find(
    (a) => a.domain.name === domainName && a.protocol.name === protocolName,
  )
  if (!adapter) return null

  return {
    domain: domainName,
    protocol: protocolName,
    handlers: {
      actions: Object.keys(adapter.domain.vocabulary.actions),
      queries: Object.keys(adapter.domain.vocabulary.queries),
      assertions: Object.keys(adapter.domain.vocabulary.assertions),
    },
  }
}
