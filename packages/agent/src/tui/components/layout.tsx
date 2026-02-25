import React from 'react'
import { Box, useStdout } from 'ink'

interface Props {
  children: React.ReactNode
}

export function Layout({ children }: Props): React.ReactElement {
  const { stdout } = useStdout()
  const width = stdout?.columns ?? 120
  const isNarrow = width < 100

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ isNarrow?: boolean }>, { isNarrow })
          : child,
      )}
    </Box>
  )
}

interface TopPanelsProps {
  left: React.ReactNode
  right: React.ReactNode
  isNarrow?: boolean
}

export function TopPanels({ left, right, isNarrow }: TopPanelsProps): React.ReactElement {
  if (isNarrow) {
    return (
      <Box flexDirection="column">
        {left}
        {right}
      </Box>
    )
  }
  return (
    <Box flexDirection="row">
      <Box width="50%">{left}</Box>
      <Box width="50%">{right}</Box>
    </Box>
  )
}
