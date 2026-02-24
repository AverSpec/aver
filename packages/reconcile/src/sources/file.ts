import { readFile } from 'node:fs/promises'
import type { EventSource, TelemetryEvent } from '../types.js'

export function fileSource(path: string): EventSource {
  return {
    async load(): Promise<TelemetryEvent[]> {
      const content = await readFile(path, 'utf-8')
      if (path.endsWith('.json')) {
        return JSON.parse(content) as TelemetryEvent[]
      }
      // JSONL format
      return content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as TelemetryEvent)
    },
  }
}
