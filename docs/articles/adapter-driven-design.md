---
layout: default
title: "Your Adapter Is a Design Review"
parent: Articles
nav_order: 3
---

# Your Adapter Is a Design Review

## The Accidental Domain Critic

When you write an acceptance test adapter, you're doing something you didn't intend: you're reviewing your domain API.

The adapter's job is simple — map domain operations to a protocol. `createTask` calls `board.create(title)`. `moveTask` calls `board.move(title, status)`. `taskInStatus` checks `board.details(title).status`. One line per operation. Pure delegation.

When the adapter is one line, the domain API is clean. When the adapter is five lines, the domain API is incomplete. When the adapter is fifteen lines, the domain API is wrong.

This isn't a metaphor. It's a mechanical signal. The adapter's complexity is inversely proportional to the quality of the domain interface it delegates to.

## What Good Looks Like

A unit adapter that maps domain operations to a `Board` object:

```typescript
export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
    assignTask: async (board, { title, assignee }) => board.assign(title, assignee),
    deleteTask: async (board, { title }) => board.delete(title),
  },
  queries: {
    tasksByStatus: async (board, { status }) => board.byStatus(status),
    taskDetails: async (board, { title }) => board.details(title),
  },
  assertions: {
    taskInStatus: async (board, { title, status }) => {
      expect(board.details(title)?.status).toBe(status)
    },
    taskAssignedTo: async (board, { title, assignee }) => {
      expect(board.details(title)?.assignee).toBe(assignee)
    },
  },
})
```

Every action is one call. Every query is one call. Assertions are a call plus an `expect`. The adapter is boring — and that's the point. Boring means the domain API matches the behavioral vocabulary exactly. There's no translation layer because there's nothing to translate.

## What a Smell Looks Like

```typescript
createTask: async (board, { title }) => {
  const id = crypto.randomUUID()
  const task = { id, title, status: 'backlog', assignee: null, createdAt: new Date() }
  board.tasks.push(task)
  board.emit('task-created', task)
}
```

This adapter is constructing an entity, generating an ID, setting defaults, pushing to a collection, and emitting an event. Every one of those responsibilities belongs inside the domain. The domain's public interface is `board.tasks` — a raw array — instead of `board.create(title)` — an operation with intent.

The adapter isn't wrong. The domain API is incomplete. The adapter is just the first thing that noticed.

## The Pressure Gradient

This creates a natural pressure gradient across all three adapter levels:

**Unit adapter** — If delegation isn't trivial, the domain model's public API doesn't match the domain vocabulary. The domain is either missing an operation, exposing internals, or requiring the caller to orchestrate steps that should be encapsulated.

**HTTP adapter** — If the request/response mapping isn't straightforward, the API design doesn't reflect the domain. Routes should mirror domain operations. If `assignTask` requires two HTTP calls, or the response shape doesn't match what the domain query returns, the API layer is adding friction that doesn't need to exist.

**Browser adapter** — If a single domain action requires a complex sequence of UI interactions, the UI doesn't reflect the domain model. This doesn't mean every action is one click — forms have multiple fields. But if `createTask` requires navigating three screens, opening a modal, and scrolling to a section, the UI's information architecture has drifted from the domain.

The same vocabulary, applied at three levels, tells you three different things about the quality of your architecture:

| Adapter | What complexity signals |
|---------|----------------------|
| Unit | Domain API is incomplete or leaky |
| HTTP | API routes don't match domain operations |
| Playwright | UI workflow doesn't reflect domain model |

## DDD from the Outside In

The standard DDD advice is top-down: model your aggregates, define your bounded contexts, build services, then test. This works on greenfield projects with experienced teams. It doesn't work when you're extracting a domain model from existing code — which is most of the time.

The adapter-driven approach works from the outside in.

**Step 1: Name the behaviors.** What does the system do? Not how — what. `createTask`, `moveTask`, `assignTask`. These come from conversations, from watching users, from reading existing code. They become the domain definition.

**Step 2: Write the adapter.** Start with unit. Try to map each domain operation to a call on your existing code. What happens?

If delegation is trivial — `board.create(title)` — your code already has a clean domain interface. You just didn't call it that.

If delegation requires orchestration — constructing objects, calling multiple methods, managing state — you've found the gap between your domain vocabulary and your implementation. That gap is your refactoring target.

**Step 3: Close the gap.** Push the orchestration into the domain. Make `board.create(title)` handle ID generation, defaults, events, persistence — whatever the adapter was doing manually. The adapter gets simpler. The domain gets richer. The test doesn't change.

This is the opposite of "design the domain first, then test it." It's "declare the behaviors first, attempt delegation, and let the friction tell you what the domain needs."

## The Adapter as a Refactoring Guide

When you refactor the domain to simplify an adapter, you're not doing it for the test's sake. You're doing it because the adapter revealed that your domain's public interface doesn't match its actual responsibilities.

Before refactoring:

```typescript
// Adapter does too much
moveTask: async (board, { title, status }) => {
  const task = board.tasks.find(t => t.title === title)
  if (!task) throw new Error('not found')
  if (!['backlog', 'in-progress', 'done'].includes(status))
    throw new Error('invalid status')
  task.status = status
  task.updatedAt = new Date()
  board.emit('task-moved', task)
}
```

After refactoring the domain:

```typescript
// Domain owns the operation
moveTask: async (board, { title, status }) => board.move(title, status)
```

Everything the adapter was doing — lookup, validation, mutation, timestamping, events — now lives in `board.move()`. The adapter delegates. The domain encapsulates. And crucially, the refactoring was guided by a concrete signal: the adapter was too complex.

This is DDD's "push behavior onto the domain model" advice, but with a mechanical indicator instead of a design principle. You don't need to know DDD theory to follow this signal. If the adapter is doing work, the domain should own it. That's the whole heuristic.

## Why Assertions Matter Too

Actions and queries get most of the attention, but assertions are where this pattern gets interesting.

```typescript
// This assertion is a query + expectation
taskInStatus: async (board, { title, status }) => {
  expect(board.details(title)?.status).toBe(status)
}
```

If you find yourself writing:

```typescript
taskInStatus: async (board, { title, status }) => {
  const tasks = board.tasks.filter(t => t.status === status)
  const task = tasks.find(t => t.title === title)
  expect(task).toBeDefined()
}
```

...the domain doesn't have a clean way to answer the question "is this task in this status?" That's a missing query, or a query with the wrong interface. The assertion adapter is telling you the domain's read model doesn't match how the system is actually queried.

## This Isn't Just Testing Advice

The adapter pattern does double duty. It's a testing mechanism (run the same test at every level) and a design mechanism (the adapter's shape critiques the domain's interface).

Most testing frameworks don't care about your domain model. They give you hooks to set up state and check results. The quality of your underlying architecture is invisible to the test.

With domain-driven adapters, the architecture becomes visible. A clean domain produces a thin adapter. A messy domain produces a thick adapter. You can literally measure your domain model's quality by counting lines in the unit adapter.

That's not a metric anyone would put on a dashboard. But it's a heuristic that works every time you open the adapter file and think "this is doing too much." That thought is the design review. The adapter is the reviewer.

## The Practical Upshot

If you're adopting AverSpec and writing your first unit adapter:

1. **Start with delegation.** Try to make every handler a single call to your domain object.
2. **Notice where you can't.** That's where the domain API is incomplete.
3. **Don't fix the adapter.** Fix the domain. Push the logic down.
4. **The adapter gets simpler.** That's how you know the domain got better.

The test never changes. The adapter gets thinner. The domain gets richer. The architecture improves as a side effect of writing acceptance tests.

That's the part nobody told me about acceptance testing: it's not just verification. It's design feedback. The adapter is the signal.

---

*Aver is MIT-licensed and open source.*
