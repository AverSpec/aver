interface AgentArgs {
  command: 'start' | 'stop' | 'status' | 'log' | 'dashboard' | 'help'
  goal?: string
}

export async function runAgentCommand(_parsed: AgentArgs): Promise<void> {
  console.log(
    'The aver agent has moved to the aver-experimental repo.\n' +
    'See: https://github.com/njackson/aver-experimental',
  )
  process.exit(0)
}
