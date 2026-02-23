import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TestResult {
  testName: string
  domain: string
  status: 'pass' | 'fail' | 'skip'
  trace: Array<{ kind: string; name: string; status: string; error?: string }>
}

export interface RunData {
  timestamp: string
  results: TestResult[]
  error?: string
  vocabularyCoverage?: Array<{
    domain: string
    actions: { total: string[]; called: string[] }
    queries: { total: string[]; called: string[] }
    assertions: { total: string[]; called: string[] }
    percentage: number
  }>
}

const MAX_RUNS = 10

export class RunStore {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  save(run: RunData): void {
    const base = run.timestamp.replace(/[:.]/g, '-')
    const existing = this.listRuns().filter(f => f.startsWith(base))
    const seq = String(existing.length).padStart(3, '0')
    const filename = `${base}_${seq}.json`
    writeFileSync(join(this.dir, filename), JSON.stringify(run, null, 2))
    this.enforceRetention()
  }

  getLatest(): RunData | undefined {
    const files = this.listRuns()
    if (files.length === 0) return undefined
    return this.readRun(files[files.length - 1])
  }

  getLastTwo(): [RunData | undefined, RunData | undefined] {
    const files = this.listRuns()
    if (files.length === 0) return [undefined, undefined]
    if (files.length === 1) return [undefined, this.readRun(files[0])]
    return [
      this.readRun(files[files.length - 2]),
      this.readRun(files[files.length - 1]),
    ]
  }

  listRuns(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  }

  private readRun(filename: string): RunData {
    return JSON.parse(readFileSync(join(this.dir, filename), 'utf-8'))
  }

  private enforceRetention(): void {
    const files = this.listRuns()
    while (files.length > MAX_RUNS) {
      const oldest = files.shift()!
      unlinkSync(join(this.dir, oldest))
    }
  }
}
