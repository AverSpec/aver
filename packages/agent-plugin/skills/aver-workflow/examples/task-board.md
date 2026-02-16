# Example: Adding `deleteTask` to the Task Board

This walkthrough shows the full Aver workflow in practice — adding a `deleteTask` feature to an existing task-board application with unit, HTTP, and Playwright adapters.

## Starting Point

The task-board domain already had 3 actions (`createTask`, `moveTask`, `assignTask`), 2 queries, and 3 assertions. All adapters (unit, HTTP, Playwright) were implemented.

## Step 1: Explore

Using `list_domains` and `get_domain_vocabulary`, we see the existing vocabulary:

```
Domain: task-board
Actions: createTask, moveTask, assignTask
Queries: tasksByStatus, taskDetails
Assertions: taskInStatus, taskAssignedTo, taskCount
```

## Step 2: Locate

Using `get_project_context`, we find the file paths:

```json
{
  "configPath": "aver.config.ts",
  "domains": [{
    "name": "task-board",
    "domainFile": "domains/task-board.ts",
    "testFile": "tests/task-board.spec.ts",
    "adapters": [
      { "protocol": "unit", "file": "adapters/task-board.unit.ts" },
      { "protocol": "http", "file": "adapters/task-board.http.ts" },
      { "protocol": "playwright", "file": "adapters/task-board.playwright.ts" }
    ]
  }]
}
```

Read `domains/task-board.ts` to see the type signatures.

## Step 3: Define

Add `deleteTask` to the domain:

```typescript
// domains/task-board.ts
export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>(),
    deleteTask: action<{ title: string }>(),        // ← NEW
    moveTask: action<{ title: string; status: string }>(),
    assignTask: action<{ title: string; assignee: string }>(),
  },
  // ... queries and assertions unchanged
})
```

At this point, TypeScript flags all 3 adapter files because they're missing the `deleteTask` handler.

## Step 4: Test

Write the test first — it uses only domain vocabulary, not adapter details:

```typescript
// tests/task-board.spec.ts
test('delete a task', async ({ act, assert }) => {
  await act.createTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 1 })
  await act.deleteTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 0 })
})
```

This test will run against all 3 adapters automatically.

## Step 5: Implement

### Unit adapter — direct model call

```typescript
// adapters/task-board.unit.ts
actions: {
  deleteTask: async (board, { title }) => {
    board.delete(title)
  },
  // ...
}
```

Also add `delete(title)` to the `Board` model class.

### HTTP adapter — API call

```typescript
// adapters/task-board.http.ts
actions: {
  deleteTask: async (ctx, { title }) => {
    const res = await ctx.delete(`/api/tasks/${encodeURIComponent(title)}`)
    if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
  },
  // ...
}
```

Also add the `DELETE /api/tasks/:title` Express route.

### Playwright adapter — browser interaction

```typescript
// adapters/task-board.playwright.ts
actions: {
  deleteTask: async (page, { title }) => {
    await page.getByTestId(`task-${title}`).getByTestId('delete-btn').click()
    await page.getByTestId(`task-${title}`).waitFor({ state: 'detached' })
  },
  // ...
}
```

Also add the delete button to the React UI component.

## Step 6: Verify

Run `run_tests` — all 15 tests pass (5 tests x 3 adapters):

```
create a task in backlog [unit]        ✓
create a task in backlog [http]        ✓
create a task in backlog [playwright]  ✓
delete a task [unit]                   ✓
delete a task [http]                   ✓
delete a task [playwright]             ✓
...
```

Use `get_run_diff` to confirm the new tests are "newly passing."

## Key Takeaways

1. **Domain first** — define the vocabulary before any implementation
2. **TypeScript enforces completeness** — adding to the domain flags every adapter that needs updating
3. **One test, all protocols** — the `delete a task` test ran automatically against unit, HTTP, and Playwright
4. **Assertions are reusable** — `taskCount` already existed and worked perfectly for verifying deletion
