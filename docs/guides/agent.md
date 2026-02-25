---
layout: default
title: Agent CLI
parent: Guides
nav_order: 4
---

# Agent CLI

{: .warning }
The `@aver/agent` package is **experimental**. APIs and behavior may change between releases.

The `aver agent` command runs an AI-powered development assistant that works through your scenario workspace — investigating requirements, writing tests, and advancing scenarios through their maturity stages.

## Prerequisites

- **Claude Code** installed and available on your `PATH` (the CLI auto-detects the `claude` executable)
- **@anthropic-ai/claude-agent-sdk** installed as a dev dependency in your project
- An `aver.config.ts` in your project root

```bash
npm install -D @aver/agent @anthropic-ai/claude-agent-sdk
```

## Commands

### `aver agent start [goal]`

Start a new agent session with a goal described in natural language.

```bash
aver agent start "add task cancellation to the todo domain"
```

The agent creates a session under `.aver/agent/` in your project root, then begins a supervisor/worker loop until the goal is complete or you stop it. On startup it prints the configured models, project ID, and goal.

The goal argument is required. If omitted, the CLI prints a usage hint and exits.

**Interactive mode:** When running in a terminal, the supervisor can ask you questions (with numbered options). You respond inline.

**Non-interactive mode:** When stdin is not a TTY (e.g., in CI), the agent auto-answers questions with the first available option.

Press `Ctrl-C` to gracefully stop after the current cycle.

### `aver agent status`

Show the current session's status, token usage, and cycle count.

```
Agent Session: abc-123
  Goal:     add task cancellation
  Status:   running
  Cycles:   3
  Workers:  5
  Tokens:   supervisor=873, worker=7610
  Total:    8483 tokens
  Created:  2026-02-24T10:00:00Z
  Updated:  2026-02-24T10:05:00Z
```

Prints "No active agent session." if no session exists.

### `aver agent stop`

Send a stop signal to the running agent. The agent finishes its current cycle before shutting down.

```bash
aver agent stop
# Stop signal sent. Agent will stop after current cycle.
```

### `aver agent log`

Print the event stream from the current session. Each line shows a timestamp, cycle ID, event type, and optional data.

```bash
aver agent log
# [10:00:05 AM] cycle-1 cycle:start
# [10:00:12 AM] cycle-1 worker:dispatch {"goal":"investigate requirements"}
# [10:01:30 AM] cycle-1 worker:result {"status":"complete"}
# [10:01:31 AM] cycle-1 cycle:end
```

### `aver agent dashboard`

Open a web dashboard in the browser. **Coming soon** -- this command is not yet implemented.

## Configuration

The agent uses sensible defaults. You can override them by passing a custom config to `CycleEngine` programmatically. The CLI uses `DEFAULT_CONFIG`:

| Field | Default | Description |
|:------|:--------|:------------|
| `model.supervisor` | `claude-sonnet-4-5-20250929` | Model for the supervisor (planning and coordination) |
| `model.worker` | `claude-opus-4-6` | Model for workers (investigation, coding, testing) |
| `cycles.checkpointInterval` | `10` | Events between automatic checkpoints |
| `cycles.rollupThreshold` | `3` | Checkpoints before a rollup summary |
| `cycles.maxWorkerIterations` | `15` | Maximum turns per worker dispatch |
| `dashboard.port` | `4700` | Port for the web dashboard |
| `claudeExecutablePath` | Auto-detected | Path to the `claude` binary. The CLI runs `which claude` automatically. |

## How It Works

The agent follows a **supervisor/worker** architecture:

1. **Supervisor** receives the goal, your scenario workspace state, and recent events. It decides what to do next: dispatch a worker, ask you a question, create a checkpoint, or stop.
2. **Workers** are dispatched with a specific sub-goal, a skill (e.g., investigation, test-writing), and a permission level (`read_only`, `edit`, or `full`). Each worker runs in its own Claude session.
3. After workers complete, results flow back to the supervisor, which decides the next action.
4. This cycle repeats until the supervisor declares the goal complete or you send a stop signal.

Session state is persisted to `.aver/agent/` so you can check status and logs from another terminal. The scenario workspace (`.aver/workspace/`) is shared between the agent and the MCP server tools.

## File Layout

```
.aver/
  agent/
    session.json       # Current session state
    events.jsonl       # Event stream (append-only)
    artifacts/         # Worker-produced artifacts
  workspace/
    scenarios.json     # Shared scenario workspace
```
