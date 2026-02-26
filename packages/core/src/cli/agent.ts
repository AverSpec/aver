import type { AgentArgs } from '@aver/agent'

export async function runAgentCommand(parsed: AgentArgs): Promise<void> {
  switch (parsed.command) {
    case 'start':
      await runStart(parsed.goal)
      break
    case 'stop':
      await runStop()
      break
    case 'status':
      await runStatus()
      break
    case 'log':
      await runLog()
      break
    case 'dashboard':
      console.log('Use "aver agent start" to launch the interactive dashboard.')
      break
  }
}

async function runStart(goal?: string): Promise<void> {
  const { resolve } = await import('node:path')
  const { execSync } = await import('node:child_process')

  // Detect claude executable path for the Agent SDK
  let claudeExecutablePath: string | undefined
  try {
    claudeExecutablePath = execSync('which claude', { encoding: 'utf-8' }).trim()
  } catch {
    console.error('Could not find "claude" executable. Ensure Claude Code is installed.')
    process.exit(1)
  }

  const cwd = process.cwd()
  const agentPath = resolve(cwd, '.aver', 'agent')
  const workspacePath = resolve(cwd, '.aver', 'workspace')
  const projectId = cwd.split('/').pop() ?? 'unknown'

  const { DEFAULT_CONFIG } = await import('@aver/agent')
  const config = { ...DEFAULT_CONFIG, claudeExecutablePath }

  // Try TUI if interactive terminal
  if (process.stdin.isTTY) {
    try {
      const { renderTui } = await import('@aver/agent/tui')
      await renderTui({ goal, agentPath, workspacePath, projectId, config })
      return
    } catch (err) {
      // If ink/react not installed, fall through to plain-text mode
      if (err instanceof Error && err.message.includes('Cannot find')) {
        console.error(
          'TUI requires ink and react. Install them:\n  pnpm add -D ink react @types/react\n\nFalling back to plain-text mode.\n',
        )
      } else {
        throw err
      }
    }
  }

  // Plain-text fallback (non-TTY or missing TUI deps)
  if (!goal) {
    console.error('Usage: aver agent start "your goal here"')
    process.exit(1)
  }

  // TODO: wire to AgentNetwork (Task 19) — CycleEngine deleted in Task 16
  console.error('Plain-text agent mode not yet wired to AgentNetwork. Use TUI mode or wait for Task 19.')
  process.exit(1)
}

async function runStop(): Promise<void> {
  const { requestStop } = await import('@aver/agent')
  const { resolve } = await import('node:path')

  const agentPath = resolve(process.cwd(), '.aver', 'agent')

  try {
    await requestStop(agentPath)
    console.log('Stop signal sent. Agent will stop after current cycle.')
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

async function runStatus(): Promise<void> {
  const { loadSession } = await import('@aver/agent')
  const { resolve } = await import('node:path')

  const agentPath = resolve(process.cwd(), '.aver', 'agent')
  const session = await loadSession(agentPath)

  if (!session) {
    console.log('No active agent session.')
    return
  }

  console.log(`Agent Session: ${session.id}`)
  console.log(`  Goal:     ${session.goal}`)
  console.log(`  Status:   ${session.status}`)
  console.log(`  Cycles:   ${session.cycleCount}`)
  console.log(`  Workers:  ${session.workerCount}`)
  console.log(`  Tokens:   supervisor=${session.tokenUsage.supervisor}, worker=${session.tokenUsage.worker}`)
  console.log(`  Total:    ${session.tokenUsage.supervisor + session.tokenUsage.worker} tokens`)
  console.log(`  Created:  ${session.createdAt}`)
  console.log(`  Updated:  ${session.updatedAt}`)
  if (session.lastError) {
    console.log(`  Error:    ${session.lastError}`)
  }
}

async function runLog(): Promise<void> {
  const { readEvents } = await import('@aver/agent')
  const { resolve } = await import('node:path')

  const agentPath = resolve(process.cwd(), '.aver', 'agent')
  const events = await readEvents(agentPath)

  if (events.length === 0) {
    console.log('No events recorded.')
    return
  }

  for (const event of events) {
    const time = new Date(event.timestamp).toLocaleTimeString()
    const dataStr = Object.keys(event.data).length > 0
      ? ' ' + JSON.stringify(event.data)
      : ''
    console.log(`[${time}] ${event.cycleId} ${event.type}${dataStr}`)
  }
}
