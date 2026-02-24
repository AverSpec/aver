type Level = 'info' | 'warn' | 'error'

export function log(level: Level, message: string, context?: Record<string, unknown>): void {
  const entry = { level, message, timestamp: new Date().toISOString(), ...context }
  console.error(JSON.stringify(entry))
}
