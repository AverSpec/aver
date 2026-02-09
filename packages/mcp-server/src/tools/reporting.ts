import type { RunStore } from '../runs.js'

export interface RunDiff {
  previousRun: string
  currentRun: string
  newlyFailing: string[]
  newlyPassing: string[]
  stillFailing: string[]
  stillPassing: number
}

export function getRunDiffHandler(store: RunStore): RunDiff | null {
  const [prev, curr] = store.getLastTwo()
  if (!prev || !curr) return null

  const prevStatuses = new Map<string, string>()
  for (const r of prev.results) {
    prevStatuses.set(r.testName, r.status)
  }

  const newlyFailing: string[] = []
  const newlyPassing: string[] = []
  const stillFailing: string[] = []
  let stillPassing = 0

  for (const r of curr.results) {
    const prevStatus = prevStatuses.get(r.testName)

    if (r.status === 'fail') {
      if (prevStatus === 'fail') {
        stillFailing.push(r.testName)
      } else {
        newlyFailing.push(r.testName)
      }
    } else if (r.status === 'pass') {
      if (prevStatus === 'fail') {
        newlyPassing.push(r.testName)
      } else {
        stillPassing++
      }
    }
  }

  return {
    previousRun: prev.timestamp,
    currentRun: curr.timestamp,
    newlyFailing,
    newlyPassing,
    stillFailing,
    stillPassing,
  }
}
