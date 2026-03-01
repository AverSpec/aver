import { describe } from 'vitest'
import { suite } from '@aver/core'
import { questionManagement } from './domains/question-management'
import { questionManagementAdapter } from './adapters/question-management.unit'

describe('Question Management', () => {
  const { test } = suite(questionManagement, questionManagementAdapter)

  // --- Adding Questions (d252b3cd) ---

  describe('adding questions', () => {
    test('adds a question with auto-generated ID', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'needs clarification' })
      await when.addQuestion({ text: 'What happens on timeout?' })
      await then.questionExists({ text: 'What happens on timeout?' })
      await then.questionCountIs({ count: 1 })
    })

    test('open question is reflected in count', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'multiple questions' })
      await when.addQuestion({ text: 'First question' })
      await then.questionCountIs({ count: 1 })
      await when.addQuestion({ text: 'Second question' })
      await then.questionCountIs({ count: 2 })
    })

    test('adding question to non-existent scenario fails', async ({ when, then }) => {
      // session.scenarioId is empty — no scenario created
      await when.addQuestion({ text: 'orphan question' })
      await then.operationFailed({ message: 'Scenario not found' })
    })
  })

  // --- Resolving Questions (9667776c) ---

  describe('resolving questions', () => {
    test('resolving sets answer and timestamp', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'question lifecycle' })
      await given.addQuestion({ text: 'How many retries?' })
      await when.resolveQuestion({ answer: 'Three retries' })
      await then.questionResolved({ answer: 'Three retries' })
    })

    test('resolving last question brings count to zero', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'unblock advancement' })
      await given.addQuestion({ text: 'Blocking question' })
      await then.questionCountIs({ count: 1 })
      await when.resolveQuestion({ answer: 'Answered' })
      await then.questionCountIs({ count: 0 })
    })

    test('resolving question on non-existent scenario fails', async ({ when, then }) => {
      await when.resolveQuestion({ answer: 'orphan answer' })
      await then.operationFailed({ message: 'Scenario not found' })
    })

    test('resolving non-existent question fails', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'no questions yet' })
      // session.lastQuestionId is empty — no question added
      await when.resolveQuestion({ answer: 'ghost answer' })
      await then.operationFailed({ message: 'Question not found' })
    })
  })
})
