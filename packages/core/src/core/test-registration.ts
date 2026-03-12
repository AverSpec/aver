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

export function shouldFilterOutDomain(domain: Domain): boolean {
  if (typeof process === 'undefined') return false
  const filter = process.env.AVER_DOMAIN
  if (!filter) return false
  return filter !== domain.name
}

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

      // each is a factory — wrap the *result* of calling it
      if (prop === 'each') {
        return (...args: any[]) =>
          buildTestApi(testImpl.each(...args), domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }

      // skipIf / runIf are factories — wrap the *result* of calling them
      if (prop === 'skipIf' || prop === 'runIf') {
        return (...args: any[]) =>
          buildTestApi(child.call(testImpl, ...args), domain, getEffectiveAdapters, globalSkipImpl, calledOps)
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
      testImpl(name, async () => {
        await maybeAutoloadConfig()
        const a = findAdapter(domain)
        if (!a) throw new Error(buildMissingAdapterError(domain))
        await runTestWithAdapter(a, domain, name, fn, calledOps)
      })
      return
    }

    if (adapters.length === 1) {
      const a = adapters[0]
      testImpl(name, async () => {
        await runTestWithAdapter(a, domain, name, fn, calledOps)
      })
      return
    }

    // Multi-adapter: parameterized test names
    for (const a of adapters) {
      const adapterName = `${name} [${a.protocol.name}]`
      testImpl(adapterName, async () => {
        await runTestWithAdapter(a, domain, adapterName, fn, calledOps)
      })
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
