import { readdir, stat, access } from 'node:fs/promises'
import { join, parse as parsePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerDomain, getDomains } from '@aver/core'
import { toKebabCase } from '@aver/core/scaffold'
import type { Domain } from '@aver/core'
import { log } from './logger.js'

/**
 * Detect whether an import error is due to Node not having a TypeScript loader.
 * Common error codes/messages when importing .ts without tsx/ts-node/--loader:
 * - ERR_UNKNOWN_FILE_EXTENSION: "Unknown file extension \".ts\""
 * - SyntaxError from encountering TS syntax (type annotations, etc.)
 */
export function isTypeScriptLoaderError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message ?? ''
  const code = (err as NodeJS.ErrnoException).code ?? ''
  return (
    code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    (err instanceof SyntaxError && /\b(type|interface|import\.meta)\b/.test(msg))
  )
}

/**
 * Given a .ts file path, find a compiled .js fallback in the same directory.
 * Returns the .js path if it exists, or undefined.
 */
export async function findCompiledFallback(tsFilePath: string): Promise<string | undefined> {
  const { dir, name } = parsePath(tsFilePath)
  const jsPath = join(dir, `${name}.js`)
  try {
    await access(jsPath)
    return jsPath
  } catch {
    return undefined
  }
}

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

    // Build a set of basenames that have .js files so we can skip .ts duplicates
    const jsBasenames = new Set<string>()
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const { name: base, ext } = parsePath(entry.name)
      if (ext === '.js') jsBasenames.add(base)
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/\.(ts|js|mjs)$/.test(entry.name)) continue

      const { name: base, ext } = parsePath(entry.name)

      // Skip .ts files when a .js sibling exists (prefer compiled output)
      if (ext === '.ts' && jsBasenames.has(base)) {
        log('info', 'skipping .ts file (compiled .js sibling exists)', {
          filePath: join(dir, entry.name),
          jsFile: join(dir, `${base}.js`),
        })
        continue
      }

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
        // If a .ts file failed, try to find and import a compiled .js fallback
        if (ext === '.ts' && isTypeScriptLoaderError(err)) {
          const fallbackPath = await findCompiledFallback(filePath)
          if (fallbackPath) {
            try {
              const fallbackUrl = pathToFileURL(fallbackPath).href + `?t=${Date.now()}`
              const mod = await import(fallbackUrl)
              for (const exported of Object.values(mod)) {
                if (isDomain(exported) && !seen.has(exported.name)) {
                  seen.add(exported.name)
                  found.push({ domain: exported, filePath: fallbackPath })
                }
              }
              log('info', '.ts import failed, loaded compiled .js fallback', {
                tsFile: filePath,
                jsFile: fallbackPath,
              })
              continue
            } catch (fallbackErr) {
              log('warn', '.ts import failed and .js fallback also failed', {
                tsFile: filePath,
                jsFile: fallbackPath,
                error: (fallbackErr as Error).message,
              })
              continue
            }
          }
          log('warn', '.ts file cannot be imported without a TypeScript loader (tsx, ts-node, or --loader). ' +
            'Either compile to .js or run with a TS-capable runtime.', {
            filePath,
            error: (err as Error).message,
            hint: 'Run with tsx or ts-node, or compile your domains to .js',
          })
        } else {
          log('warn', 'skipping file (import failed)', { filePath, error: (err as Error).message })
        }
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
