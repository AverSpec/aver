import * as p from '@clack/prompts'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { initProjectFiles, initDomainFiles } from './scaffold'

export async function runInit(subcommand?: string): Promise<void> {
  if (subcommand === 'domain') {
    await runInitDomain()
    return
  }

  p.intro('Welcome to Aver')

  const dir = resolve('.')
  const configExists = existsSync(resolve(dir, 'aver.config.ts'))

  if (configExists) {
    const shouldContinue = await p.confirm({
      message: 'aver.config.ts already exists. Continue anyway?',
    })
    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }

  const s = p.spinner()
  s.start('Creating project structure')
  initProjectFiles(dir)
  s.stop('Project structure created')

  p.log.info("Let's create your first domain.")

  await promptDomain(dir)

  p.outro('Done! Next steps:\n  1. Define your vocabulary in the domain file\n  2. Wire up handlers in the adapter file\n  3. Write tests in the test file\n  4. Run: npx aver run')
}

async function runInitDomain(): Promise<void> {
  const dir = resolve('.')

  if (!existsSync(resolve(dir, 'aver.config.ts'))) {
    p.log.error('No aver.config.ts found. Run `aver init` first.')
    process.exit(1)
  }

  await promptDomain(dir)

  p.outro('Domain created!')
}

async function promptDomain(dir: string): Promise<void> {
  const name = await p.text({
    message: 'Domain name?',
    placeholder: 'taskBoard',
    validate: (value) => {
      if (!value) return 'Domain name is required'
      if (/\s/.test(value)) return 'No spaces allowed'
    },
  })

  if (p.isCancel(name)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const protocol = await p.select({
    message: 'Which protocol?',
    options: [
      { value: 'unit', label: 'unit', hint: 'in-process, no infrastructure' },
      { value: 'http', label: 'http', hint: 'calls your API over HTTP' },
      { value: 'playwright', label: 'playwright', hint: 'drives a browser' },
    ],
  })

  if (p.isCancel(protocol)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const s = p.spinner()
  s.start('Generating files')
  initDomainFiles(dir, name as string, protocol as string)
  s.stop('Files generated')
}
