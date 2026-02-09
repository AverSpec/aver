import type { Adapter } from './adapter'
import type { Domain } from './domain'

let adapters: Adapter[] = []

export function _registerAdapter(adapter: Adapter): void {
  adapters.push(adapter)
}

export function _findAdapter(domain: Domain): Adapter | undefined {
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

export function _getAdapters(): Adapter[] {
  return [...adapters]
}

export function _resetRegistry(): void {
  adapters = []
}
