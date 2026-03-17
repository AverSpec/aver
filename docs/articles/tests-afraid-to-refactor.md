---
layout: default
title: "The Tests You're Afraid to Refactor"
parent: Articles
nav_order: 2
---

# The Tests You're Afraid to Refactor

You start with unit tests. Then you add API tests because the integration matters. Then someone adds Playwright because the button didn't actually work. Now "create a task" lives in a unit factory, an API helper, a page object, and the implementation itself. Four descriptions of the same behavior, none of them connected.

It works until something changes. Rename a status, add a required field, change a default. Now you're updating all four places, running three suites, and hoping they still agree. The tests you wrote to make change safe are the thing making change hard.

---

## One behavior, one place

```bash
npm install --save-dev @averspec/core vitest
npx aver init
```

Three files.

## The domain

A contract. The domain says what the system does. It says nothing about how.

```typescript
import { defineDomain, action, query, assertion } from '@averspec/core'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string }>(),
    moveTask:   action<{ title: string; status: string }>(),
    deleteTask: action<{ title: string }>(),
  },
  queries: {
    taskDetails: query<{ title: string }, Task | undefined>(),
  },
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
    taskCount:    assertion<{ status: string; count: number }>(),
  },
})
```

## The adapter

Maps the domain to real code:

```typescript
import { implement, unit } from '@averspec/core'
import { Board } from '../src/board.js'
import { taskBoard } from '../domains/task-board.js'

export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),

  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask:   async (board, { title, status }) => board.move(title, status),
    deleteTask: async (board, { title }) => board.delete(title),
  },

  queries: {
    taskDetails: async (board, { title }) => board.details(title),
  },

  assertions: {
    taskInStatus: async (board, { title, status }) => {
      expect(board.details(title)?.status).toBe(status)
    },
    taskCount: async (board, { status, count }) => {
      expect(board.byStatus(status)).toHaveLength(count)
    },
  },
})
```

Every domain operation gets a handler. Miss one and it won't compile.

## The test

Speaks only domain language:

```typescript
import { suite } from '@averspec/core'
import { taskBoard } from '../domains/task-board.js'

const { test } = suite(taskBoard)

test('create a task in backlog', async ({ when, then }) => {
  await when.createTask({ title: 'Fix login bug' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await then.taskCount({ status: 'backlog', count: 1 })
})

test('move task through workflow', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix login bug' })
  await when.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskCount({ status: 'backlog', count: 0 })
})
```

No selectors. No HTTP calls. No `new Board()`. The test doesn't know what's underneath it.

```bash
npx aver run
```

```
 ✓ create a task in backlog [unit]          1ms
 ✓ move task through workflow [unit]        1ms
```

## Add a second adapter

Say you have an Express API:

```bash
npm install --save-dev @averspec/protocol-http
```

```typescript
export const httpAdapter = implement(taskBoard, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),

  actions: {
    createTask: async (ctx, { title }) => {
      const res = await ctx.post('/api/tasks', { title })
      if (!res.ok) throw new Error(`${res.status}`)
    },
    // ...same shape, different protocol
  },

  // queries, assertions...
})
```

Register both adapters in `aver.config.ts`. Run again:

```
 ✓ create a task in backlog [unit]          1ms
 ✓ create a task in backlog [http]         48ms
 ✓ move task through workflow [unit]        1ms
 ✓ move task through workflow [http]       11ms
```

Same tests. Didn't touch them.

## When things disagree

Say someone changes the API so that creating a task defaults to `"todo"` instead of `"backlog"`. The unit adapter still passes. The HTTP adapter fails:

```
 ✓ create a task in backlog [unit]          1ms
 ✗ create a task in backlog [http]         52ms
   → expected "backlog" but got "todo"
```

That's a real bug at a real boundary. The domain says tasks start in backlog. The API disagrees. Without the shared contract, you'd find this in production or not at all, because the unit test and the API test would each use their own vocabulary and both would pass.

---

Change the behavior in one place. The tests tell you everywhere it breaks.

[How it works](introducing-aver) · [Legacy code tutorial](../tutorial) · [Greenfield tutorial](../tutorial-greenfield) · [GitHub](https://github.com/AverSpec/aver)
