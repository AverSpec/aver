import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { getAdapters, getDomains, getDomain } from '@aver/core'
import { toKebabCase } from '@aver/core/scaffold'
import { getConfigPath, getProjectRoot } from '../config.js'
import { scanAdapterFiles, matchDomainByKebab, getDomainFilePaths } from '../discovery.js'

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

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
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
  // Try adapter registry first
  const adapters = getAdapters()
  const adapter = adapters.find(
    (a) => a.domain.name === domainName && a.protocol.name === protocolName,
  )
  if (adapter) {
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

  // Fall back to domain registry (vocabulary is on the domain)
  const domain = getDomain(domainName)
  if (domain) {
    return {
      domain: domainName,
      protocol: protocolName,
      handlers: {
        actions: Object.keys(domain.vocabulary.actions),
        queries: Object.keys(domain.vocabulary.queries),
        assertions: Object.keys(domain.vocabulary.assertions),
      },
    }
  }

  return null
}

export interface ProjectContext {
  configPath: string | null
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

function findFile(projectRoot: string, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(resolve(projectRoot, candidate))) return candidate
  }
  return null
}

export async function getProjectContextHandler(): Promise<ProjectContext | null> {
  const root = getProjectRoot()
  if (!root) return null

  const configPath = getConfigPath()
  const relativeConfig = configPath ? relative(root, configPath) : null

  // Build domain list from registry + adapter info
  const registeredDomains = getDomains()
  const adapters = getAdapters()

  // Get discovery caches
  const domainPaths = getDomainFilePaths()
  const adapterFiles = await scanAdapterFiles(root)

  // Index adapter files by domain kebab name
  const adapterFilesByDomain = new Map<string, typeof adapterFiles>()
  for (const f of adapterFiles) {
    if (!adapterFilesByDomain.has(f.domainKebab)) adapterFilesByDomain.set(f.domainKebab, [])
    adapterFilesByDomain.get(f.domainKebab)!.push(f)
  }

  // Group registered adapters by domain
  const adaptersByDomain = new Map<string, string[]>()
  for (const adapter of adapters) {
    const name = adapter.domain.name
    if (!adaptersByDomain.has(name)) adaptersByDomain.set(name, [])
    adaptersByDomain.get(name)!.push(adapter.protocol.name)
  }

  // Merge domain info from both sources
  const allDomainNames = new Set<string>()
  for (const d of registeredDomains) allDomainNames.add(d.name)
  for (const [name] of adaptersByDomain) allDomainNames.add(name)

  const domains = Array.from(allDomainNames).map((name) => {
    const kebab = toKebabCase(name)

    // Use discovery cache for domain file, fall back to convention guess
    const discoveredDomainPath = domainPaths.get(name)
    const domainFile = discoveredDomainPath
      ? relative(root, discoveredDomainPath)
      : findFile(root, `domains/${kebab}.ts`, `domains/${kebab}.js`)

    const testFile = findFile(
      root,
      `tests/${kebab}.spec.ts`,
      `tests/${kebab}.spec.js`,
      `tests/${kebab}.test.ts`,
      `tests/${kebab}.test.js`,
    )

    // Protocols from adapter registry
    const registeredProtocols = adaptersByDomain.get(name) ?? []

    // Protocols from filesystem scan
    const scannedAdapters = adapterFilesByDomain.get(kebab) ?? []
    const fileProtocols = scannedAdapters.map(f => f.protocol)

    // Merge and deduplicate
    const allProtocols = [...new Set([...registeredProtocols, ...fileProtocols])]

    const adapterEntries = allProtocols.map((protocol) => {
      // Use actual discovered file path first
      const scanned = scannedAdapters.find(f => f.protocol === protocol)
      const file = scanned
        ? relative(root, scanned.filePath)
        : findFile(root, `adapters/${kebab}.${protocol}.ts`, `adapters/${kebab}.${protocol}.js`)
      return { protocol, file }
    })

    return { name, domainFile, testFile, adapters: adapterEntries }
  })

  return {
    configPath: relativeConfig,
    projectRoot: root,
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
