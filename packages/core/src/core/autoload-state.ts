/**
 * Isolated module for the config-autoload flag.
 * Kept separate to avoid circular dependencies between registry and test-registration.
 */
let configAutoloadAttempted = false

export function getConfigAutoloadAttempted(): boolean {
  return configAutoloadAttempted
}

export function setConfigAutoloadAttempted(value: boolean): void {
  configAutoloadAttempted = value
}

export function resetConfigAutoload(): void {
  configAutoloadAttempted = false
}
