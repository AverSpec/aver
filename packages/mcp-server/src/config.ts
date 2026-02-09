import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const CONFIG_FILENAMES = ['aver.config.ts', 'aver.config.js', 'aver.config.mjs']

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
    if (values.config) return values.config as string
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
  await import(configPath)
}
