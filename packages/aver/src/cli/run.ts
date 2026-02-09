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

  const { execFileSync } = await import('node:child_process')
  execFileSync('npx', ['vitest', ...vitestArgs], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}
