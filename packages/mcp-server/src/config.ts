import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { resetRegistry } from 'aver'

const CONFIG_FILENAMES = ['aver.config.ts', 'aver.config.js', 'aver.config.mjs']

let storedConfigPath: string | undefined

export function getConfigPath(): string | undefined {
  return storedConfigPath
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

export async function reloadConfig(): Promise<void> {
  if (!storedConfigPath) return
  resetRegistry()
  // Cache-bust the ESM import by appending a unique query param
  const url = pathToFileURL(storedConfigPath).href + `?t=${Date.now()}`
  await import(url)
}
