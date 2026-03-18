import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { findAdapter, getAdapters } from './registry'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runTestWithAdapter } from './test-runner'
import type { CalledOps } from './proxy'
import type { TestContext } from './suite'
import { getConfigAutoloadAttempted, setConfigAutoloadAttempted, resetConfigAutoload } from './autoload-state'

export function getGlobalTest(injected?: any): any {
  if (injected !== undefined) return injected
  return (globalThis as any).test ?? (globalThis as any).it
}

export function getGlobalDescribe(injected?: (name: string, fn: () => void) => void): (name: string, fn: () => void) => void {
  if (injected !== undefined) return injected
  const describe = (globalThis as any).describe
  if (typeof describe !== 'function') {
    return () => {
      throw new Error('Aver requires a test runner with describe(). Did you forget to run Vitest or Jest?')
    }
  }
  return describe
}

export function buildMissingAdapterError(domain: Domain): string {
  const registered = getAdapters()
  if (registered.length === 0) {
    return (
      `No adapter registered for domain "${domain.name}". ` +
      `No adapters are registered. ` +
      `Pass an adapter to suite() or register one via defineConfig().`
    )
  }
  const list = registered
    .map(a => `${a.domain.name} (${a.protocol.name})`)
    .join(', ')
  return (
    `No adapter registered for domain "${domain.name}". ` +
    `Registered: ${list}. ` +
    `Pass an adapter to suite() or register one via defineConfig().`
  )
}

/** Aver context property names that cannot be used as fixture names. */
const AVER_RESERVED = new Set(['act', 'given', 'when', 'query', 'assert', 'then', 'trace'])

export function shouldFilterOutDomain(domain: Domain): boolean {
  if (typeof process === 'undefined') return false
  const filter = process.env.AVER_DOMAIN
  if (!filter) return false
  return filter !== domain.name
}

/**
 * Wraps a test runner's `test` function with Aver's adapter plumbing.
 *
 * Vitest's `test` is a recursive ChainableFunction — every modifier (skip, only,
 * concurrent, sequential, fails, todo) returns another chainable with the same
 * modifiers. We use a Proxy to intercept property access and recursively wrap
 * each modifier so the final call (name, fn) always goes through runTestWithAdapter.
 *
 * Special cases:
 * - `todo`: passthrough (no test body, just a label)
 * - `each` / `for`: factories that return a test function — wrap the result
 * - `skipIf` / `runIf`: factories that return a chainable — wrap the result
 * - `extend`: merges vitest fixture context with Aver's test context
 *
 * Jest compatibility: Jest's `test` is flat (no chaining). The Proxy's recursive
 * behavior is harmless — modifiers that don't exist return undefined.
 */
export function buildTestApi<D extends Domain>(
  testImpl: any,
  domain: D,
  getEffectiveAdapters: () => Adapter[],
  globalSkipImpl?: any,
  calledOps?: CalledOps,
): any {
  const base = makeTestFn(testImpl, domain, getEffectiveAdapters, globalSkipImpl, calledOps)

  if (!testImpl) return base

  return new Proxy(base, {
    get(_, prop) {
      const child = testImpl[prop]
      if (child === undefined) return undefined

      // todo is pass-through — no test body to wrap
      if (prop === 'todo') return child.bind(testImpl)

      // each / for are factories — wrap the *result* of calling them
      if (prop === 'each' || prop === 'for') {
        return (...args: any[]) =>
          buildTestApi(testImpl[prop](...args), domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }

      // skipIf / runIf are factories — wrap the *result* of calling them
      if (prop === 'skipIf' || prop === 'runIf') {
        return (...args: any[]) =>
          buildTestApi(child.call(testImpl, ...args), domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }

      // extend merges vitest fixture context with Aver's test context
      if (prop === 'extend') {
        return (fixtures: Record<string, unknown>) => {
          for (const key of Object.keys(fixtures)) {
            if (AVER_RESERVED.has(key)) {
              throw new Error(
                `fixture name "${key}" conflicts with Aver's test context. ` +
                `Choose a different name for your fixture.`
              )
            }
          }
          const extended = child.call(testImpl, fixtures)
          return buildTestApi(extended, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
        }
      }

      // Everything else: recursively wrap (handles only, skip, concurrent, etc.)
      if (typeof child === 'function') {
        return buildTestApi(child, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }

      return child
    },
  })
}

function makeTestFn<D extends Domain>(
  testImpl: any,
  domain: D,
  getEffectiveAdapters: () => Adapter[],
  globalSkipImpl?: any,
  calledOps?: CalledOps,
): (name: string, fn: (ctx: TestContext<D>) => Promise<void>) => void {
  // Wraps the user's test fn to merge vitest fixture context (if any) with Aver context.
  // When vitest resolves fixtures via test.extend(), it passes them as the first arg.
  function wrapWithFixtureMerge(
    userFn: (ctx: TestContext<D>) => Promise<void>,
  ): (ctx: TestContext<D>) => Promise<void> {
    return (userFn as any).__averWrapped ? userFn : Object.assign(
      (averCtx: TestContext<D>) => userFn(averCtx),
      { __averWrapped: true },
    )
  }

  function registerTest(
    adapter: Adapter,
    testName: string,
    userFn: (ctx: TestContext<D>) => Promise<void>,
  ): void {
    const wrappedFn = wrapWithFixtureMerge(userFn)
    testImpl(testName, async (vitestCtx?: Record<string, unknown>) => {
      await runTestWithAdapter(adapter, domain, testName, async (averCtx) => {
        const merged = vitestCtx && typeof vitestCtx === 'object'
          ? { ...vitestCtx, ...averCtx } as TestContext<D>
          : averCtx
        await wrappedFn(merged)
      }, calledOps)
    })
  }

  return (name, fn) => {
    if (!testImpl) {
      throw new Error('Aver requires a test runner. Did you forget to run Vitest or Jest?')
    }

    if (shouldFilterOutDomain(domain)) {
      if (typeof globalSkipImpl === 'function') {
        globalSkipImpl(name, async () => {})
      }
      return
    }

    const adapters = getEffectiveAdapters()

    if (adapters.length === 0) {
      testImpl(name, async (vitestCtx?: Record<string, unknown>) => {
        await maybeAutoloadConfig()
        const a = findAdapter(domain)
        if (!a) throw new Error(buildMissingAdapterError(domain))
        await runTestWithAdapter(a, domain, name, async (averCtx) => {
          const merged = vitestCtx && typeof vitestCtx === 'object'
            ? { ...vitestCtx, ...averCtx } as TestContext<D>
            : averCtx
          await fn(merged)
        }, calledOps)
      })
      return
    }

    if (adapters.length === 1) {
      registerTest(adapters[0], name, fn)
      return
    }

    // Multi-adapter: parameterized test names
    for (const a of adapters) {
      const adapterName = `${name} [${a.protocol.name}]`
      registerTest(a, adapterName, fn)
    }
  }
}

export { resetConfigAutoload }

async function maybeAutoloadConfig(): Promise<void> {
  if (getConfigAutoloadAttempted()) return
  setConfigAutoloadAttempted(true)
  if (typeof process === 'undefined') return
  if (process.env.AVER_AUTOLOAD_CONFIG === 'false') return
  const cwd = process.cwd()
  const filenames = [
    'aver.config.ts',
    'aver.config.js',
    'aver.config.mjs',
    'aver.config.cjs',
  ]
  for (const filename of filenames) {
    const path = join(cwd, filename)
    if (!existsSync(path)) continue
    try {
      await import(pathToFileURL(path).href)
      console.log('[aver] Auto-loaded config from ' + filename)
    } catch (error) {
      throw new Error(
        `Found ${filename} but failed to load it. ` +
        `Ensure your test runner can import TypeScript config files.`,
        { cause: error as Error },
      )
    }
    return
  }
}
