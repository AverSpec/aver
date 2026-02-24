import type { MutationRunner, MutationRunnerOptions, MutantResult, MutantStatus } from '../engine-types.js'

/**
 * Stryker-based mutation runner for TypeScript/JavaScript.
 *
 * Requires `@stryker-mutator/core` to be installed (optional peer dep).
 * Uses Stryker's programmatic API: `new Stryker(config).runMutationTest()`.
 */
export function createStrykerRunner(config?: {
  testRunner?: string
  configFile?: string
}): MutationRunner {
  return {
    name: 'stryker',
    async run(opts: MutationRunnerOptions): Promise<MutantResult[]> {
      let Stryker: any
      try {
        const mod = await import('@stryker-mutator/core')
        Stryker = mod.Stryker ?? mod.default
      } catch {
        throw new Error(
          '@stryker-mutator/core is not installed. Install it to use implementation mutations:\n' +
          '  pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker'
        )
      }

      const strykerConfig: Record<string, unknown> = {
        testRunner: config?.testRunner ?? 'vitest',
        reporters: ['clear-text'],
        concurrency: 4,
        ...(opts.cwd ? { symlinkNodeModules: false } : {}),
      }

      if (opts.scope?.length) {
        strykerConfig.mutate = opts.scope
      }

      if (opts.incremental) {
        strykerConfig.incremental = true
      }

      if (config?.configFile) {
        strykerConfig.configFile = config.configFile
      }

      const stryker = new Stryker(strykerConfig)
      const results: any[] = await stryker.runMutationTest()

      return results.map((r: any) => mapStrykerResult(r))
    },
  }
}

function mapStrykerResult(r: any): MutantResult {
  return {
    id: r.id ?? String(r.mutantId ?? ''),
    status: mapStatus(r.status),
    mutatorName: r.mutatorName ?? 'unknown',
    replacement: r.replacement ?? '',
    location: {
      file: r.fileName ?? '',
      startLine: r.location?.start?.line ?? 0,
      startColumn: r.location?.start?.column ?? 0,
      endLine: r.location?.end?.line ?? 0,
      endColumn: r.location?.end?.column ?? 0,
    },
    killedBy: r.killedBy,
    description: r.description,
  }
}

function mapStatus(status: string): MutantStatus {
  const map: Record<string, MutantStatus> = {
    Killed: 'killed',
    Survived: 'survived',
    Timeout: 'timeout',
    CompileError: 'compile-error',
    RuntimeError: 'runtime-error',
  }
  const mapped = map[status]
  if (!mapped) {
    console.warn(`@aver/mutation-testing: unknown Stryker mutant status "${status}", treating as survived`)
  }
  return mapped ?? 'survived'
}
