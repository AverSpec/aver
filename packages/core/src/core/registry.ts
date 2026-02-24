import type { Adapter } from './adapter'
import type { Domain } from './domain'
import { resetConfigAutoload } from './autoload-state'

let adapters: Adapter[] = []
let domains: Domain[] = []

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

export function findAdapter(domain: Domain): Adapter | undefined {
  const exact = adapters.find(a => a.domain === domain)
  if (exact) return exact

  let current: Domain | undefined = domain
  while (current?.parent) {
    current = current.parent
    const parentMatch = adapters.find(a => a.domain === current)
    if (parentMatch) return parentMatch
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

  return results
}

export function getAdapters(): Adapter[] {
  return [...adapters]
}

export function resetRegistry(): void {
  adapters = []
  domains = []
  resetConfigAutoload()
}
