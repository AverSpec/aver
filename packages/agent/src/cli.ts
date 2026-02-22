export interface AgentArgs {
  command: 'start' | 'status' | 'stop' | 'log' | 'dashboard' | 'help'
  goal?: string
}

const VALID_COMMANDS = new Set(['start', 'status', 'stop', 'log', 'dashboard'])

export function parseAgentArgs(argv: string[]): AgentArgs {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    return { command: 'help' }
  }

  const [command, ...rest] = argv

  if (!VALID_COMMANDS.has(command)) {
    return { command: 'help' }
  }

  return {
    command: command as AgentArgs['command'],
    goal: command === 'start' && rest.length ? rest.join(' ') : undefined,
  }
}

export function printAgentHelp(): void {
  console.log(`
aver agent - AI agent for domain-driven development

Commands:
  start [goal]    Start a new agent session (or resume existing)
  status          Show current session status and token usage
  stop            Gracefully stop after current cycle
  log             Tail the event stream
  dashboard       Open web dashboard in browser

Examples:
  aver agent start "add task cancellation"
  aver agent status
  aver agent stop
`.trim())
}
