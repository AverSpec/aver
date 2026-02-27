/**
 * Approval tests for agent prompt outputs (P1-12).
 *
 * Locks down the most change-sensitive prompt strings so accidental
 * regressions are caught as diff failures.
 *
 * Run with AVER_APPROVE=1 to update baselines after intentional changes.
 */
import { describe, test } from 'vitest'
import { approve } from '@aver/approvals'
import { JUDGE_SYSTEM_PROMPT, buildJudgePrompt } from '../../src/eval/judge'
import { OBSERVER_SYSTEM_PROMPT, formatMessagesPrompt } from '../../src/observe/observer-prompt'
import {
  REFLECTOR_SYSTEM_PROMPT,
  COMPRESSION_LEVEL_PROMPTS,
  buildReflectorUserPrompt,
} from '../../src/observe/reflector-prompt'

// ---------------------------------------------------------------------------
// Judge prompts
// ---------------------------------------------------------------------------

describe('judge prompts', () => {
  test('system prompt', async () => {
    await approve(JUDGE_SYSTEM_PROMPT, { name: 'judge-system' })
  })

  test('user prompt', async () => {
    const prompt = buildJudgePrompt(
      'The cart contains 3 items totaling $45.00.',
      'Output must include a dollar amount and item count.',
    )
    await approve(prompt, { name: 'judge-user' })
  })
})

// ---------------------------------------------------------------------------
// Observer prompts
// ---------------------------------------------------------------------------

describe('observer prompts', () => {
  test('system prompt', async () => {
    await approve(OBSERVER_SYSTEM_PROMPT, { name: 'observer-system' })
  })

  test('formats messages with timestamps', async () => {
    const result = formatMessagesPrompt([
      { role: 'user', content: 'Investigate the auth module', timestamp: '2026-02-27T10:00:00Z' },
      { role: 'assistant', content: 'I found 3 files in src/auth/', timestamp: '2026-02-27T10:00:05Z' },
      { role: 'tool', content: 'File read: src/auth/login.ts' },
    ])
    await approve(result, { name: 'observer-messages-with-ts' })
  })

  test('formats empty messages', async () => {
    await approve(formatMessagesPrompt([]), { name: 'observer-empty-messages' })
  })
})

// ---------------------------------------------------------------------------
// Reflector prompts
// ---------------------------------------------------------------------------

describe('reflector prompts', () => {
  test('system prompt', async () => {
    await approve(REFLECTOR_SYSTEM_PROMPT, { name: 'reflector-system' })
  })

  test('compression level 0 — reorganize', async () => {
    const result = buildReflectorUserPrompt(0, '[critical] Build uses tsup\n[informational] Package count is 8')
    await approve(result, { name: 'reflector-level-0' })
  })

  test('compression level 1 — moderate', async () => {
    const result = buildReflectorUserPrompt(1, '[critical] Build uses tsup\n[informational] Package count is 8')
    await approve(result, { name: 'reflector-level-1' })
  })

  test('compression level 2 — aggressive', async () => {
    const result = buildReflectorUserPrompt(2, '[critical] Build uses tsup\n[important] Tests pass')
    await approve(result, { name: 'reflector-level-2' })
  })

  test('compression level 3 — ruthless', async () => {
    const result = buildReflectorUserPrompt(3, '[critical] Build uses tsup')
    await approve(result, { name: 'reflector-level-3' })
  })

  test('all four compression level prompts', async () => {
    const all = Object.entries(COMPRESSION_LEVEL_PROMPTS)
      .map(([level, prompt]) => `--- Level ${level} ---\n${prompt}`)
      .join('\n\n')
    await approve(all, { name: 'reflector-all-levels' })
  })
})
