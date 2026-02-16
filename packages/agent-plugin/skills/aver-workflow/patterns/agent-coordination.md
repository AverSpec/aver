# Pattern: Agent Coordination

Multi-agent team patterns for the Aver workflow. When to spawn teammates, how to divide work, and how to share state through the workspace.

## When to Use This Pattern

You have the ability to spawn agent teammates (e.g., Claude Code's `/agent` or similar team features). Multi-agent coordination accelerates the workflow by assigning different perspectives or protocols to different agents. If agent teams are not available, this document also covers graceful degradation to single-session mode.

## Core Principle: Shared Workspace, Separate Perspectives

The workspace JSON file is the shared state between agents. Each agent reads the workspace, does its work, and writes back. The workspace is file-based and designed for sequential access -- no locking is needed as long as agents take turns (not concurrent writes).

Agents coordinate by:
1. Reading the workspace to understand current state
2. Doing focused work from a specific perspective
3. Writing results back to the workspace (observations, promotions, questions)
4. Handing off to the next agent

## When to Spawn Teammates vs Work Solo

### Spawn teammates when:

- **Discovery phase with a large codebase.** Three agents investigating from Business, Development, and Testing perspectives find more than one agent cycling through perspectives.
- **Implementation phase with multiple protocols.** A unit agent, HTTP agent, and Playwright agent can implement adapters in parallel once the domain is defined.
- **The workspace has 5+ items at the same stage.** Parallel processing is worthwhile when there is enough work to distribute.

### Work solo when:

- **Kickoff phase.** Initial observation is a single-perspective activity. Spawning agents for 3-5 initial observations adds coordination overhead with no benefit.
- **Fewer than 3 workspace items.** The overhead of spawning and coordinating outweighs the parallelism benefit.
- **Formalization phase with human involvement.** Example Mapping sessions require human feedback. Multiple agents asking questions simultaneously is confusing.
- **Verification phase.** Running the full suite and reviewing coverage is a single coordinated activity.

## Discovery Phase: Three Perspectives

The discovery phase benefits most from multi-agent perspectives. Each agent investigates the same observations from a different angle.

### Agent assignments

| Agent | Perspective | Focus | Workspace Actions |
|-------|-------------|-------|-------------------|
| Agent 1 | Development | Trace code paths, find seams, map architecture | `promote_item` (to explored), `add_question` (technical) |
| Agent 2 | Business | Evaluate whether observed behaviors are intentional | `record_observation` (new behaviors), `add_question` (intent) |
| Agent 3 | Testing | Identify testability, think about examples and edge cases | `add_question` (verification), `record_observation` (edge cases) |

### Handoff sequence

```
1. Export workspace for the session
   Call export_workspace

2. Agent 1 (Development) investigates observed items
   - Reads code, traces paths, identifies seams
   - Promotes items to explored with technical rationale
   - Records questions about architecture

3. Agent 2 (Business) reviews explored items
   - Confirms or questions the intent of each behavior
   - Records new observations from user perspective
   - Adds questions about business rules

4. Agent 3 (Testing) reviews explored items
   - Evaluates testability of each behavior
   - Identifies edge cases and boundary conditions
   - Adds questions about verification strategy

5. Reconvene: review questions, resolve what can be resolved
   Call get_workspace_items  -- see full picture
```

Each agent uses `import_workspace` at the start of their turn and `export_workspace` at the end if the workspace is being passed as a file rather than using the shared workspace directory.

## Implementation Phase: Per-Protocol Agents

Once the domain is defined and tests are written, adapter implementation can be parallelized by protocol.

### Agent assignments

| Agent | Protocol | Setup Needs | Feedback Speed |
|-------|----------|-------------|----------------|
| Unit Agent | `unit()` | None -- in-memory state | Milliseconds |
| HTTP Agent | `@aver/protocol-http` | Server startup | Seconds |
| Playwright Agent | `@aver/protocol-playwright` | Server + browser | Seconds |

### Sequencing

The unit agent goes first. Its implementation validates that the domain vocabulary and test cases are correct. HTTP and Playwright agents can then work in parallel, since they implement the same domain operations through different interfaces.

```
1. Domain + tests defined (by lead agent or Testing perspective)

2. Unit Agent implements unit adapter
   Call run_tests with adapter: "unit"
   -- Fix until all tests pass

3. HTTP Agent implements HTTP adapter (can start after unit passes)
   Call run_tests with adapter: "http"
   -- Fix until all tests pass

4. Playwright Agent implements Playwright adapter (can start after unit passes)
   Call run_tests with adapter: "playwright"
   -- Fix until all tests pass

5. Lead agent runs full suite
   Call run_tests
   Call get_run_diff  -- verify no cross-protocol regressions
```

### What each protocol agent needs to know

Give each protocol agent:
- The domain file path (from `get_project_context`)
- The test file path (so they can read what the tests expect)
- The adapter file path (where to write their implementation)
- The handler signatures (from `describe_adapter_structure`)

## Review Phase: Cross-Perspective Review

After implementation, each perspective reviews the complete result:

| Reviewer | Reviews For | Key Questions |
|----------|-------------|---------------|
| Business | Domain vocabulary | "Do these operation names match our language?" |
| Development | Adapter implementations | "Are these implementations correct and maintainable?" |
| Testing | Test coverage | "Do the tests cover all examples from Example Mapping?" |

This cross-review catches issues that a single perspective misses:
- Business spots a domain name that does not match how users talk about the feature
- Development spots an adapter that makes unnecessary API calls
- Testing spots an example from formalization that was never turned into a test

## Graceful Degradation: Single-Session Mode

When agent teams are not available, one agent rotates through perspectives manually. This is the default mode and works well for smaller workspaces.

### Perspective rotation

Explicitly announce perspective switches. This keeps the reasoning focused:

```
[Switching to Development perspective]
"Investigating the task creation code path. Entry point is POST /api/tasks
at src/routes/tasks.ts:12..."

[Switching to Business perspective]
"The Development investigation found that long titles are silently truncated.
Is this the intended behavior, or should it return a validation error?
Recording a question on this item."

[Switching to Testing perspective]
"Based on the business rules confirmed so far, I need examples for:
title required, title max length, default status. Running Example Mapping..."
```

### Single-session implementation order

For implementation without protocol agents, follow this sequence:

1. Define the domain (Testing perspective)
2. Write all tests (Testing perspective)
3. Implement unit adapter (Development perspective)
4. Run tests, fix failures (Development perspective)
5. Implement HTTP adapter (Development perspective)
6. Run tests, fix failures (Development perspective)
7. Implement Playwright adapter (Development perspective)
8. Run full suite (Testing perspective)

## Sharing State via the Workspace

The workspace JSON file is the single source of truth. It contains all items with maturity stages, questions, domain links, and promotion history. Use `export_workspace` and `import_workspace` for handoffs between agents. Use `get_workspace_summary` or `get_workspace_items` to read state without modifying it.

No locking is needed. Agents take turns: read, work, write, hand off. When two agents work simultaneously (e.g., HTTP and Playwright agents implementing different adapters), they write to different code files and only read the workspace -- no conflicting updates.

## MCP Tools for This Pattern

| Tool | When to Use |
|------|------------|
| `export_workspace` | Create a portable snapshot for handoff between agents. |
| `import_workspace` | Restore workspace state at the start of an agent's turn. |
| `get_workspace_summary` | Quick overview of workspace state without modifying anything. |
| `get_workspace_items` | Detailed view of items at a specific stage. |
| `get_workflow_phase` | Determine what phase the project is in before starting work. |
| `run_tests` | Each protocol agent runs tests filtered to their adapter. |
| `get_run_diff` | After all agents finish, compare the full run to catch regressions. |

## Anti-Patterns

- **Concurrent workspace writes.** Two agents writing to the workspace simultaneously can cause lost updates. Sequence agent turns so only one writes at a time.
- **Spawning agents for trivial work.** If the workspace has 2 items and one protocol, a solo agent is faster than coordinating three agents.
- **Agents working without perspective clarity.** Each agent must know which perspective it represents. An agent without a clear perspective produces unfocused, overlapping work.
- **Skipping the unit agent first.** The unit adapter validates the domain vocabulary and test correctness. HTTP and Playwright agents should not start until unit tests pass -- otherwise they waste time debugging domain issues through slow protocols.
- **Not reviewing cross-perspective.** Each perspective catches different issues. Skipping the review phase means Business never validates the vocabulary and Testing never confirms coverage.
- **Over-coordinating.** The workspace is the coordination mechanism. Agents do not need to message each other directly -- they read and write the workspace. Keep the protocol simple.
