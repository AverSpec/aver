/** Local mirror of the AgentArgs type from @aver/agent to avoid a static dependency. */
interface AgentArgs {
  command: 'start' | 'stop' | 'status' | 'log' | 'dashboard' | 'help'
  goal?: string
}

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

  // Plain-text fallback (missing TUI deps)
  if (!process.stdin.isTTY) {
    console.error('The aver agent requires an interactive terminal (TTY). It cannot run in CI or piped environments.')
    process.exit(1)
  }

  if (!goal) {
    console.error('Usage: aver agent start "your goal here"')
    process.exit(1)
  }

  const { mkdirSync } = await import('node:fs')
  mkdirSync(agentPath, { recursive: true })

  const { createDatabase, closeDatabase, AgentNetwork, WorkspaceStore, WorkspaceOps } = await import('@aver/agent')

  const dbFilePath = resolve(agentPath, 'aver-agent.db')
  const db = await createDatabase(dbFilePath)
  const store = WorkspaceStore.fromPath(workspacePath, projectId)
  const workspaceOps = new WorkspaceOps(store)

  const { createSdkDispatchers } = await import('@aver/agent')
  const dispatchers = createSdkDispatchers({
    claudeExecutablePath: config.claudeExecutablePath,
    supervisorModel: config.model.supervisor,
    workerModel: config.model.worker,
    timeouts: {
      supervisorTotalMs: config.timeouts?.supervisorCallMs,
      workerTurnMs: config.timeouts?.workerTurnMs,
      workerTotalMs: config.timeouts?.workerTotalMs,
    },
  })

  const network = new AgentNetwork(db, dispatchers, workspaceOps, {
    supervisorModel: config.model.supervisor,
    workerModel: config.model.worker,
    maxCycleDepth: config.cycles.maxCycleDepth,
    claudeExecutablePath: config.claudeExecutablePath,
  }, {
    onMessage: (msg) => console.log(`[agent] ${msg}`),
    onQuestion: async (question) => {
      console.log(`[agent] Question: ${question}`)
      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      return new Promise<string>((res) => {
        rl.question('> ', (answer) => {
          rl.close()
          res(answer)
        })
      })
    },
  })

  console.log(`Starting agent session for: ${goal}`)

  try {
    await network.start(goal)
    // The network runs asynchronously via trigger queue.
    // In plain-text mode, we wait briefly then report status.
    // The session will keep running in the trigger queue callbacks.
    console.log('Agent session started. Use "aver agent status" to check progress.')
  } catch (err) {
    console.error(`Agent failed: ${err instanceof Error ? err.message : String(err)}`)
    closeDatabase(db)
    process.exit(1)
  }
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
