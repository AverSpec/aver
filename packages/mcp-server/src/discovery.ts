import { readdir, stat } from 'node:fs/promises'
import { join, parse as parsePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerDomain, getDomains } from '@aver/core'
import { toKebabCase as coreToKebabCase } from '@aver/core/scaffold'
import type { Domain } from '@aver/core'
import { log } from './logger.js'

// Re-export for backward compatibility
export const toKebabCase = coreToKebabCase

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.aver', '.worktrees'])

export function isDomain(value: unknown): value is Domain {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  if (typeof obj.name !== 'string') return false
  if (!obj.vocabulary || typeof obj.vocabulary !== 'object') return false
  const vocab = obj.vocabulary as Record<string, unknown>
  return (
    typeof vocab.actions === 'object' && vocab.actions !== null &&
    typeof vocab.queries === 'object' && vocab.queries !== null &&
    typeof vocab.assertions === 'object' && vocab.assertions !== null
  )
}

export async function scanConventionDirs(rootDir: string, targetName: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.name === targetName) {
        results.push(fullPath)
      } else {
        await walk(fullPath)
      }
    }
  }

  await walk(rootDir)
  return results
}

export interface DiscoveredDomain {
  domain: Domain
  filePath: string
}

const domainFilePaths = new Map<string, string>()

export function getDomainFilePaths(): Map<string, string> {
  return new Map(domainFilePaths)
}

export function resetDiscoveryCache(): void {
  domainFilePaths.clear()
}

export async function discoverDomains(rootDir: string): Promise<DiscoveredDomain[]> {
  const domainDirs = await scanConventionDirs(rootDir, 'domains')
  const found: DiscoveredDomain[] = []
  const seen = new Set<string>()

  for (const dir of domainDirs) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/\.(ts|js|mjs)$/.test(entry.name)) continue

      const filePath = join(dir, entry.name)
      try {
        const url = pathToFileURL(filePath).href + `?t=${Date.now()}`
        const mod = await import(url)
        for (const exported of Object.values(mod)) {
          if (isDomain(exported) && !seen.has(exported.name)) {
            seen.add(exported.name)
            found.push({ domain: exported, filePath })
          }
        }
      } catch (err) {
        log('warn', 'skipping file (import failed)', { filePath, error: (err as Error).message })
      }
    }
  }

  return found
}

export interface AdapterFileInfo {
  domainKebab: string
  protocol: string
  filePath: string
}

export async function scanAdapterFiles(rootDir: string): Promise<AdapterFileInfo[]> {
  const adapterDirs = await scanConventionDirs(rootDir, 'adapters')
  const results: AdapterFileInfo[] = []

  for (const dir of adapterDirs) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const { name: basename, ext } = parsePath(entry.name)
      if (!/^\.(ts|js|mjs)$/.test(ext)) continue

      // Pattern: {domain-kebab}.{protocol}
      const lastDot = basename.lastIndexOf('.')
      if (lastDot <= 0) continue
      const domainKebab = basename.slice(0, lastDot)
      const protocol = basename.slice(lastDot + 1)
      if (!domainKebab || !protocol) continue

      results.push({
        domainKebab,
        protocol,
        filePath: join(dir, entry.name),
      })
    }
  }

  return results
}

export function matchDomainByKebab(kebab: string, domains: Domain[]): Domain | undefined {
  return domains.find(d => toKebabCase(d.name) === kebab)
}

export async function discoverAndRegister(rootDir: string): Promise<void> {
  resetDiscoveryCache()
  const discovered = await discoverDomains(rootDir)
  for (const { domain, filePath } of discovered) {
    registerDomain(domain)
    domainFilePaths.set(domain.name, filePath)
  }
  const count = getDomains().length
  log('info', 'discovery complete', { domainCount: count, rootDir })
}
