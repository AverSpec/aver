import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { getAdapters } from '@aver/core'
import { getConfigPath } from '../config.js'

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
  const adapters = getAdapters()
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

export interface ProjectContext {
  configPath: string
  projectRoot: string
  domains: Array<{
    name: string
    domainFile: string | null
    testFile: string | null
    adapters: Array<{ protocol: string; file: string | null }>
  }>
  conventions: {
    domainDir: string
    adapterDir: string
    testDir: string
    domainFilePattern: string
    adapterFilePattern: string
    testFilePattern: string
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function findFile(projectRoot: string, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(resolve(projectRoot, candidate))) return candidate
  }
  return null
}

export function getProjectContextHandler(): ProjectContext | null {
  const configPath = getConfigPath()
  if (!configPath) return null

  const projectRoot = dirname(configPath)
  const relativeConfig = relative(projectRoot, configPath)

  const adapters = getAdapters()

  // Group adapters by domain
  const domainMap = new Map<string, string[]>()
  for (const adapter of adapters) {
    const name = adapter.domain.name
    if (!domainMap.has(name)) domainMap.set(name, [])
    domainMap.get(name)!.push(adapter.protocol.name)
  }

  const domains = Array.from(domainMap.entries()).map(([name, protocols]) => {
    const kebab = toKebabCase(name)

    const domainFile = findFile(projectRoot, `domains/${kebab}.ts`, `domains/${kebab}.js`)
    const testFile = findFile(
      projectRoot,
      `tests/${kebab}.spec.ts`,
      `tests/${kebab}.spec.js`,
      `tests/${kebab}.test.ts`,
      `tests/${kebab}.test.js`,
    )

    const adapterEntries = protocols.map((protocol) => ({
      protocol,
      file: findFile(
        projectRoot,
        `adapters/${kebab}.${protocol}.ts`,
        `adapters/${kebab}.${protocol}.js`,
      ),
    }))

    return { name, domainFile, testFile, adapters: adapterEntries }
  })

  return {
    configPath: relativeConfig,
    projectRoot,
    domains,
    conventions: {
      domainDir: 'domains',
      adapterDir: 'adapters',
      testDir: 'tests',
      domainFilePattern: '{kebab-name}.ts',
      adapterFilePattern: '{kebab-name}.{protocol}.ts',
      testFilePattern: '{kebab-name}.spec.ts',
    },
  }
}
