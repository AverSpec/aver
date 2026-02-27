import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { resetRegistry } from '@aver/core'
import { discoverAndRegister } from './discovery.js'
import { log } from './logger.js'
import { clearWorkspaceCache } from './tools/workspace.js'

const CONFIG_FILENAMES = ['aver.config.ts', 'aver.config.js', 'aver.config.mjs']

let storedConfigPath: string | undefined
let projectRoot: string | undefined

export function getConfigPath(): string | undefined {
  return storedConfigPath
}

export function getProjectRoot(): string | undefined {
  return projectRoot
}

export function setProjectRoot(root: string): void {
  projectRoot = root
}

/** Reset internal config state — for testing only. */
export function resetConfigState(): void {
  storedConfigPath = undefined
  projectRoot = undefined
}

export function findConfigFile(dir: string): string | undefined {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(dir, filename)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

export function resolveConfigPath(argv: string[], cwd?: string): string | undefined {
  // Check --config flag
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        config: { type: 'string' },
      },
      strict: false,
    })
    if (values.config) return resolve(cwd ?? process.cwd(), values.config as string)
  } catch {
    // ignore parse errors
  }

  // Auto-detect from cwd
  const dir = cwd ?? process.cwd()
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(dir, filename)
    if (existsSync(candidate)) return candidate
  }

  return undefined
}

export async function loadConfig(configPath: string): Promise<void> {
  storedConfigPath = configPath
  await import(pathToFileURL(configPath).href)
}

export async function reloadConfig(loader?: () => Promise<void>): Promise<void> {
  clearWorkspaceCache()

  if (loader) {
    resetRegistry()
    await loader()
    return
  }

  if (storedConfigPath) {
    resetRegistry()
    // Cache-bust the ESM import by appending a unique query param
    const url = pathToFileURL(storedConfigPath).href + `?t=${Date.now()}`
    await import(url)
    return
  }

  if (projectRoot) {
    // Check if a config file appeared since startup (e.g. user created one).
    // If it exists, load it instead of falling back to auto-discovery.
    // If it's broken, the error propagates — we never silently ignore a config.
    const detectedConfig = findConfigFile(projectRoot)
    if (detectedConfig) {
      resetRegistry()
      storedConfigPath = detectedConfig
      const url = pathToFileURL(detectedConfig).href + `?t=${Date.now()}`
      await import(url)
      return
    }

    resetRegistry()
    await discoverAndRegister(projectRoot)
  }
}
