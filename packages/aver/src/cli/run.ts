import { parseArgs } from 'node:util'

export interface RunArgs {
  adapter?: string
  domain?: string
  watch: boolean
}

export function parseRunArgs(argv: string[]): RunArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      adapter: { type: 'string' },
      domain: { type: 'string' },
      watch: { type: 'boolean', default: false },
    },
    strict: true,
  })

  return {
    adapter: values.adapter,
    domain: values.domain,
    watch: values.watch ?? false,
  }
}

export async function runCommand(argv: string[]): Promise<void> {
  const args = parseRunArgs(argv)

  const vitestArgs = ['run']
  if (args.watch) vitestArgs[0] = 'watch'

  const env: Record<string, string> = {}
  if (args.adapter) env.AVER_ADAPTER = args.adapter
  if (args.domain) env.AVER_DOMAIN = args.domain
  if (!process.env.AVER_AUTOLOAD_CONFIG) env.AVER_AUTOLOAD_CONFIG = 'true'

  const { execFileSync } = await import('node:child_process')
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execFileSync(npx, ['vitest', ...vitestArgs], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    timeout: 10 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  })
}
