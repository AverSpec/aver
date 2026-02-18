export interface RunArgs {
  adapter?: string
  domain?: string
  watch: boolean
  passthroughArgs: string[]
}

export function parseRunArgs(argv: string[]): RunArgs {
  let adapter: string | undefined
  let domain: string | undefined
  let watch = false
  const passthroughArgs: string[] = []

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]

    if (arg === '--adapter' || arg.startsWith('--adapter=')) {
      if (arg.includes('=')) {
        adapter = arg.split('=')[1]
      } else if (i + 1 < argv.length) {
        adapter = argv[++i]
      } else {
        throw new Error('--adapter requires a value')
      }
    } else if (arg === '--domain' || arg.startsWith('--domain=')) {
      if (arg.includes('=')) {
        domain = arg.split('=')[1]
      } else if (i + 1 < argv.length) {
        domain = argv[++i]
      } else {
        throw new Error('--domain requires a value')
      }
    } else if (arg === '--watch') {
      watch = true
    } else {
      passthroughArgs.push(arg)
    }
    i++
  }

  return { adapter, domain, watch, passthroughArgs }
}

export async function runCommand(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
aver run - Run acceptance tests via vitest

Aver options:
  --adapter <name>   Filter tests by adapter/protocol name
  --domain <name>    Filter tests by domain name
  --watch            Run in watch mode

All other options and positional arguments are forwarded to vitest.
Examples:
  aver run                              Run all tests
  aver run tests/cart.spec.ts           Run specific file
  aver run --adapter playwright         Run only playwright adapter
  aver run --reporter=json              Pass --reporter to vitest
  aver run --adapter unit --grep "add"  Mix aver and vitest flags
`)
    return
  }

  const args = parseRunArgs(argv)

  const vitestArgs = ['run']
  if (args.watch) vitestArgs[0] = 'watch'
  vitestArgs.push(...args.passthroughArgs)

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
