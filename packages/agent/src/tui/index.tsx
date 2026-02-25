import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import type { AgentConfig } from '../types.js'

export interface TuiOptions {
  goal?: string
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
}

export async function renderTui(options: TuiOptions): Promise<void> {
  const instance = render(
    <App
      goal={options.goal}
      agentPath={options.agentPath}
      workspacePath={options.workspacePath}
      projectId={options.projectId}
      config={options.config}
    />,
  )
  await instance.waitUntilExit()
}
