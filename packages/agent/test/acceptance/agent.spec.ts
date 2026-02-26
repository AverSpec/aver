import { suite } from '@aver/core'
import { AverAgent } from '../../src/domain.js'
import { averAgentAdapter } from './adapter.js'

const { test, act, query, then } = suite(AverAgent, averAgentAdapter)

test('stops immediately when supervisor says stop', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'nothing to do' } },
    tokenUsage: 100,
  })
  await act.startSession({ goal: 'investigate auth' })
  await then.sessionStopped()
})

test('records session goal', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'done' } },
    tokenUsage: 0,
  })
  await act.startSession({ goal: 'refactor login flow' })
  const goal = await query.sessionGoal()
  expect(goal).toBe('refactor login flow')
})

test('dispatches single worker and persists artifact', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: false,
          permissionLevel: 'read_only' as const,
        },
      },
    },
    tokenUsage: 100,
  })
  await act.queueWorkerResult({
    result: {
      summary: 'found issues',
      artifacts: [{
        name: 'findings',
        type: 'investigation' as const,
        summary: 'Investigation findings',
        content: '# Investigation Results\n\nFound 3 issues.',
      }],
      status: 'complete' as const,
    },
    tokenUsage: 500,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'work complete' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'investigate auth' })
  await then.sessionStopped()
  await then.artifactExists({ name: 'findings' })
})

test('dispatches parallel workers', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_workers',
        workers: [
          {
            goal: 'investigate module A',
            artifacts: [],
            skill: 'investigation',
            allowUserQuestions: false,
            permissionLevel: 'read_only' as const,
          },
          {
            goal: 'investigate module B',
            artifacts: [],
            skill: 'investigation',
            allowUserQuestions: false,
            permissionLevel: 'read_only' as const,
          },
        ],
      },
    },
    tokenUsage: 200,
  })
  await act.queueWorkerResult({
    result: { summary: 'module A done', artifacts: [], status: 'complete' as const },
    tokenUsage: 300,
  })
  await act.queueWorkerResult({
    result: { summary: 'module B done', artifacts: [], status: 'complete' as const },
    tokenUsage: 400,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'both workers done' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'parallel investigation' })
  await then.sessionStopped()
  const workers = await query.workerCount()
  expect(workers).toBe(2)
})

test('pauses on ask_user without onQuestion', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'ask_user',
        question: 'Which module should I focus on?',
        options: ['auth', 'payments'],
      },
    },
    tokenUsage: 80,
  })
  await act.startSession({ goal: 'investigate system' })
  await then.sessionPaused()
})

test('resumes from paused state', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'ask_user',
        question: 'Which module?',
      },
    },
    tokenUsage: 80,
  })
  await act.startSession({ goal: 'investigate system' })
  await then.sessionPaused()

  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'user answered' } },
    tokenUsage: 50,
  })
  await act.resumeSession({ answer: 'auth module' })
  await then.sessionStopped()
})

test('handles checkpoint and continues', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'checkpoint',
        summary: 'Investigated auth module, found 3 issues',
      },
    },
    tokenUsage: 100,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'checkpoint done' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'deep investigation' })
  await then.sessionStopped()
})

test('handles complete_story and continues', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'complete_story',
        scenarioId: 'scenario-1',
        summary: 'Story completed successfully',
        projectConstraints: ['All auth flows must use OAuth2'],
      },
    },
    tokenUsage: 120,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'story archived' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'complete auth story' })
  await then.sessionStopped()
})

test('accumulates supervisor token usage across cycles', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: false,
          permissionLevel: 'read_only' as const,
        },
      },
    },
    tokenUsage: 150,
  })
  await act.queueWorkerResult({
    result: { summary: 'done', artifacts: [], status: 'complete' as const },
    tokenUsage: 0,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'done' } },
    tokenUsage: 100,
  })
  await act.startSession({ goal: 'token tracking' })
  const usage = await query.tokenUsage()
  expect(usage.supervisor).toBe(250)
})

test('accumulates worker token usage', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: false,
          permissionLevel: 'read_only' as const,
        },
      },
    },
    tokenUsage: 100,
  })
  await act.queueWorkerResult({
    result: { summary: 'done', artifacts: [], status: 'complete' as const },
    tokenUsage: 800,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'done' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'worker token tracking' })
  const usage = await query.tokenUsage()
  expect(usage.worker).toBe(800)
})

test('delivers messageToUser via onMessage', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: { type: 'stop', reason: 'done' },
      messageToUser: 'Progress update',
    },
    tokenUsage: 100,
  })
  await act.startSession({ goal: 'messaging test' })
  await then.messageReceived({ text: 'Progress update' })
})

test('persists artifact content readable via query', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'write findings',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: false,
          permissionLevel: 'read_only' as const,
        },
      },
    },
    tokenUsage: 100,
  })
  await act.queueWorkerResult({
    result: {
      summary: 'wrote findings',
      artifacts: [{
        name: 'auth-findings',
        type: 'investigation' as const,
        summary: 'Auth investigation findings',
        content: '# Auth Investigation\n\nOAuth2 flow has a bug.',
      }],
      status: 'complete' as const,
    },
    tokenUsage: 500,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'done' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'artifact content test' })
  const content = await query.artifactContent({ name: 'auth-findings' })
  expect(content).toBe('# Auth Investigation\n\nOAuth2 flow has a bug.')
})

test('records correct cycle and worker counts', async ({ act, query, then }) => {
  await act.queueSupervisorDecision({
    decision: {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: false,
          permissionLevel: 'read_only' as const,
        },
      },
    },
    tokenUsage: 100,
  })
  await act.queueWorkerResult({
    result: { summary: 'done', artifacts: [], status: 'complete' as const },
    tokenUsage: 300,
  })
  await act.queueSupervisorDecision({
    decision: { action: { type: 'stop', reason: 'done' } },
    tokenUsage: 50,
  })
  await act.startSession({ goal: 'count tracking' })
  const cycles = await query.cycleCount()
  const workers = await query.workerCount()
  expect(cycles).toBe(2)
  expect(workers).toBe(1)
})
