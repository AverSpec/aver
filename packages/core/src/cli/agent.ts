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
      console.log('aver agent dashboard: coming soon.')
      break
  }
}

async function runStart(goal?: string): Promise<void> {
  if (!goal) {
    console.error('Usage: aver agent start "your goal here"')
    process.exit(1)
  }

  // Check for API key early
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY environment variable.')
    console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...')
    process.exit(1)
  }

  const { CycleEngine, DEFAULT_CONFIG } = await import('@aver/agent')
  const { resolve } = await import('node:path')
  const { createInterface } = await import('node:readline')

  const cwd = process.cwd()
  const agentPath = resolve(cwd, '.aver', 'agent')
  const workspacePath = resolve(cwd, '.aver', 'workspace')

  // Derive projectId from directory name
  const projectId = cwd.split('/').pop() ?? 'unknown'

  // Set up readline for interactive questions
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const onQuestion = async (question: string, options?: string[]): Promise<string> => {
    let prompt = `\n${question}\n`
    if (options?.length) {
      options.forEach((opt, i) => {
        prompt += `  ${i + 1}. ${opt}\n`
      })
      prompt += 'Your choice (number or text): '
    } else {
      prompt += 'Your answer: '
    }
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        // If they entered a number and we have options, map it
        if (options?.length) {
          const idx = parseInt(answer, 10)
          if (idx >= 1 && idx <= options.length) {
            resolve(options[idx - 1])
            return
          }
        }
        resolve(answer)
      })
    })
  }

  const engine = new CycleEngine({
    agentPath,
    workspacePath,
    projectId,
    config: DEFAULT_CONFIG,
    onMessage: (message: string) => {
      console.log(`\n${message}`)
    },
    onQuestion,
  })

  // Handle Ctrl-C gracefully
  process.on('SIGINT', async () => {
    console.log('\n\nGracefully stopping agent...')
    const { requestStop } = await import('@aver/agent')
    try {
      await requestStop(agentPath)
    } catch {
      // Session may already be stopped
    }
    rl.close()
    process.exit(0)
  })

  console.log(`Starting aver agent...`)
  console.log(`  Goal: ${goal}`)
  console.log(`  Supervisor: ${DEFAULT_CONFIG.model.supervisor}`)
  console.log(`  Worker: ${DEFAULT_CONFIG.model.worker}`)
  console.log(`  Project: ${projectId}`)
  console.log()

  try {
    await engine.start(goal)
    const session = await engine.getSession()
    console.log(`\nAgent session complete.`)
    if (session) {
      console.log(`  Status: ${session.status}`)
      console.log(`  Cycles: ${session.cycleCount}`)
      console.log(`  Workers: ${session.workerCount}`)
      console.log(`  Tokens: supervisor=${session.tokenUsage.supervisor}, worker=${session.tokenUsage.worker}`)
    }
  } catch (err) {
    console.error(`\nAgent error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  } finally {
    rl.close()
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
