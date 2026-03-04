import type { Adapter } from './adapter'
import type { Domain } from './domain'
import { resetConfigAutoload } from './autoload-state'

let adapters: Adapter[] = []
let domains: Domain[] = []
const warnedDomains = new Set<string>()

export function registerDomain(domain: Domain): void {
  const exists = domains.some(d => d.name === domain.name)
  if (!exists) domains.push(domain)
}

export function getDomains(): Domain[] {
  return [...domains]
}

export function getDomain(name: string): Domain | undefined {
  return domains.find(d => d.name === name)
}

export function registerAdapter(adapter: Adapter): void {
  const exists = adapters.some(
    a => a.domain === adapter.domain && a.protocol === adapter.protocol
  )
  if (!exists) adapters.push(adapter)
  registerDomain(adapter.domain)
}

/**
 * Find a single adapter registered for the given domain, falling back to
 * parent domains if no exact match is found.
 *
 * Domains are matched by **reference identity** (`===`), not structural
 * equality. Callers must pass the same `Domain` object that was used in
 * `implement(domain, ...)` when the adapter was created. In practice this
 * means importing and reusing the domain constant rather than reconstructing
 * an equivalent object.
 */
export function findAdapter(domain: Domain): Adapter | undefined {
  const exact = adapters.find(a => a.domain === domain)
  if (exact) return exact

  let current: Domain | undefined = domain
  while (current?.parent) {
    current = current.parent
    const parentMatch = adapters.find(a => a.domain === current)
    if (parentMatch) return parentMatch
  }

  // Name-based fallback for re-exported / bundler-duplicated domains
  const nameMatch = adapters.find(a => a.domain.name === domain.name)
  if (nameMatch) {
    if (!warnedDomains.has(domain.name)) {
      warnedDomains.add(domain.name)
      console.warn(
        `[aver] Domain "${domain.name}" matched by name, not reference. ` +
        `This usually means the domain was re-exported through a bundler. ` +
        `Import the domain from its original source.`
      )
    }
    return nameMatch
  }

  return undefined
}

export function findAdapters(domain: Domain): Adapter[] {
  const results: Adapter[] = []

  // Exact matches first
  for (const a of adapters) {
    if (a.domain === domain) results.push(a)
  }

  // Then parent-chain matches
  if (results.length === 0) {
    let current: Domain | undefined = domain
    while (current?.parent) {
      current = current.parent
      for (const a of adapters) {
        if (a.domain === current) results.push(a)
      }
      if (results.length > 0) break
    }
  }

  // Name-based fallback for re-exported / bundler-duplicated domains
  if (results.length === 0) {
    for (const a of adapters) {
      if (a.domain.name === domain.name) results.push(a)
    }
    if (results.length > 0 && !warnedDomains.has(domain.name)) {
      warnedDomains.add(domain.name)
      console.warn(
        `[aver] Domain "${domain.name}" matched by name, not reference. ` +
        `This usually means the domain was re-exported through a bundler. ` +
        `Import the domain from its original source.`
      )
    }
  }

  return results
}

export function getAdapters(): Adapter[] {
  return [...adapters]
}

export function resetRegistry(): void {
  adapters = []
  domains = []
  warnedDomains.clear()
  resetConfigAutoload()
}

/**
 * Snapshot/restore primitives for test isolation.
 * `getRegistrySnapshot()` captures the current state; `restoreRegistrySnapshot()`
 * puts it back. Useful in `beforeEach`/`afterEach` when you need to layer state
 * rather than fully reset it.
 */
export interface RegistrySnapshot {
  adapters: Adapter[]
  domains: Domain[]
  warnedDomains: Set<string>
}

export function getRegistrySnapshot(): RegistrySnapshot {
  return {
    adapters: [...adapters],
    domains: [...domains],
    warnedDomains: new Set(warnedDomains),
  }
}

export function restoreRegistrySnapshot(snapshot: RegistrySnapshot): void {
  adapters = [...snapshot.adapters]
  domains = [...snapshot.domains]
  warnedDomains.clear()
  for (const d of snapshot.warnedDomains) warnedDomains.add(d)
}

/**
 * Run `fn` with a fresh, isolated registry. The current registry state is
 * saved before the call and restored after it completes (or throws).
 * Any registrations made inside `fn` are visible only within `fn`.
 *
 * Supports both sync and async callbacks.
 */
export function withRegistry<T>(fn: () => T): T {
  const snapshot = getRegistrySnapshot()
  adapters = []
  domains = []
  warnedDomains.clear()
  try {
    const result = fn()
    // Handle async callbacks
    if (result && typeof (result as any).then === 'function') {
      return (result as any).then(
        (value: T) => {
          restoreRegistrySnapshot(snapshot)
          return value
        },
        (err: unknown) => {
          restoreRegistrySnapshot(snapshot)
          throw err
        },
      )
    }
    restoreRegistrySnapshot(snapshot)
    return result
  } catch (err) {
    restoreRegistrySnapshot(snapshot)
    throw err
  }
}
