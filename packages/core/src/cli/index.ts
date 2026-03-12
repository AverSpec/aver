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
  case 'approve': {
    const { runApprove } = await import('./approve.js')
    await runApprove(args)
    break
  }
  case 'telemetry': {
    const { runTelemetryCommand } = await import('./telemetry.js')
    await runTelemetryCommand(args)
    break
  }
  case '--help':
  case '-h':
  case undefined: {
    console.log(`
aver - Domain-driven acceptance testing

Commands:
  aver run           Run acceptance tests (flags forwarded to vitest)
  aver init          Scaffold a new domain
  aver approve       Update approvals
  aver telemetry     Telemetry utilities (diagnose, extract, verify)

Options:
  --help         Show this help message

Run "aver run --help" for run options.
Run "aver telemetry --help" for telemetry options.
`)
    break
  }
  default: {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}
