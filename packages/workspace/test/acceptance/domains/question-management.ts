import { defineDomain, action, query, assertion } from '@aver/core'

export const questionManagement = defineDomain({
  name: 'QuestionManagement',
  actions: {
    captureScenario: action<{ behavior: string }>(),
    addQuestion: action<{ text: string }>(),
    resolveQuestion: action<{ answer: string }>(),
  },
  queries: {
    openQuestionCount: query<void, number>(),
    questionAnswer: query<void, string | undefined>(),
    questionResolvedAt: query<void, string | undefined>(),
  },
  assertions: {
    questionExists: assertion<{ text: string }>(),
    questionResolved: assertion<{ answer: string }>(),
    questionCountIs: assertion<{ count: number }>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
