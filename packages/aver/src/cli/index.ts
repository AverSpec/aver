#!/usr/bin/env node
export {}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'run': {
    const { runCommand } = await import('./run.js')
    await runCommand(args)
    break
  }
  case 'init': {
    const { runInit } = await import('./init.js')
    await runInit(args[0])
    break
  }
  case '--help':
  case '-h':
  case undefined: {
    console.log(`
aver - Domain-driven acceptance testing

Commands:
  aver run     Run acceptance tests
  aver init    Scaffold a new domain (coming soon)

Options:
  --help       Show this help message

Run "aver run --help" for run options.
`)
    break
  }
  default: {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}
