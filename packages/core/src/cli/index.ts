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
  case 'workspace': {
    const { runWorkspace } = await import('./workspace.js')
    await runWorkspace(args)
    break
  }
  case 'agent': {
    try {
      const { parseAgentArgs, printAgentHelp } = await import('@aver/agent')
      const parsed = parseAgentArgs(args)
      if (parsed.command === 'help') {
        printAgentHelp()
      } else {
        const { runAgentCommand } = await import('./agent.js')
        await runAgentCommand(parsed)
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ERR_MODULE_NOT_FOUND') {
        console.error('Agent not installed. Run: pnpm add @aver/agent')
        process.exit(1)
      }
      throw e
    }
    break
  }
  case '--help':
  case '-h':
  case undefined: {
    console.log(`
aver - Domain-driven acceptance testing

Commands:
  aver run       Run acceptance tests (flags forwarded to vitest)
  aver init      Scaffold a new domain
  aver approve   Update approvals
  aver workspace Manage scenario workspaces
  aver agent     AI agent for domain-driven development (experimental)

Options:
  --help         Show this help message

Run "aver run --help" for run options.
Run "aver workspace --help" for workspace options.
Run "aver agent --help" for agent options.
`)
    break
  }
  default: {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}
