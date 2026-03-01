import React, { useCallback, useMemo } from 'react'
import { Box, useInput, useStdout } from 'ink'
import { ChatPanel } from './chat-panel.js'
import { WorkerPanel } from './workers.js'
import { ScenarioPanel } from './scenarios.js'
import { EventPanel } from './events.js'
import { BottomBar } from './bottom-bar.js'
import type { TuiState, TuiAction, PanelId } from '../state.js'

interface Props {
  state: TuiState
  dispatch: React.Dispatch<TuiAction>
  onSubmit: (text: string) => void
}

const PANEL_CYCLE: PanelId[] = ['chat', 'workers', 'scenarios', 'events']
const KEY_TO_PANEL: Record<string, PanelId> = { '1': 'chat', '2': 'workers', '3': 'scenarios', '4': 'events' }

export function TuiShell({ state, dispatch, onSubmit }: Props): React.ReactElement {
  const { stdout } = useStdout()
  const height = stdout?.rows ?? 40
  const panelHeight = Math.max(5, height - 3) // Reserve 3 lines for bottom bar

  // Esc handler: always active so user can exit input mode
  useInput((_input, key) => {
    if (key.escape) {
      dispatch({ type: 'input_focus', focused: false })
    }
  }, { isActive: state.inputFocused })

  // Panel nav / scroll / focus: disabled when input is focused so TextInput gets all keystrokes
  useInput((input, key) => {
    if (KEY_TO_PANEL[input]) {
      dispatch({ type: 'panel_switch', panel: KEY_TO_PANEL[input] })
      return
    }
    if (key.tab) {
      const idx = PANEL_CYCLE.indexOf(state.activePanel)
      const next = PANEL_CYCLE[(idx + 1) % PANEL_CYCLE.length]
      dispatch({ type: 'panel_switch', panel: next })
      return
    }
    if (key.upArrow) {
      dispatch({ type: 'scroll', delta: 1 })
      return
    }
    if (key.downArrow) {
      dispatch({ type: 'scroll', delta: -1 })
      return
    }
    if (input === '/') {
      dispatch({ type: 'input_focus', focused: true })
      return
    }
  }, { isActive: !state.inputFocused })

  const handleSubmit = useCallback((text: string) => {
    onSubmit(text)
  }, [onSubmit])

  const handleFocus = useCallback(() => {
    dispatch({ type: 'input_focus', focused: true })
  }, [dispatch])

  const handleBlur = useCallback(() => {
    dispatch({ type: 'input_focus', focused: false })
  }, [dispatch])

  // Memoize panel content to avoid re-renders from unrelated state changes
  const panelContent = useMemo(() => (
    <PanelContent state={state} height={panelHeight} />
  ), [state.activePanel, state.chatMessages, state.supervisorThinking, state.scrollOffset,
      state.workers, state.workerStreams, state.scenarios, state.events, state.phase, panelHeight])

  return (
    <Box flexDirection="column" width="100%" height={height}>
      <Box flexGrow={1} height={panelHeight} overflow="hidden">
        {panelContent}
      </Box>
      <BottomBar
        activePanel={state.activePanel}
        inputFocused={state.inputFocused}
        pendingQuestion={state.pendingQuestion}
        phase={state.phase}
        onSubmit={handleSubmit}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </Box>
  )
}

function PanelContent({ state, height }: { state: TuiState; height: number }): React.ReactElement {
  switch (state.activePanel) {
    case 'chat':
      return (
        <ChatPanel
          messages={state.chatMessages}
          supervisorThinking={state.supervisorThinking}
          scrollOffset={state.scrollOffset}
          height={height}
        />
      )
    case 'workers':
      return (
        <WorkerPanel
          workers={state.workers}
          workerStreams={state.workerStreams}
          height={height}
          scrollOffset={state.scrollOffset}
        />
      )
    case 'scenarios':
      return (
        <ScenarioPanel
          scenarios={state.scenarios}
          height={height}
          scrollOffset={state.scrollOffset}
        />
      )
    case 'events':
      return (
        <EventPanel
          events={state.events}
          phase={state.phase}
          supervisorThinking={state.supervisorThinking}
          height={height}
          scrollOffset={state.scrollOffset}
        />
      )
  }
}
