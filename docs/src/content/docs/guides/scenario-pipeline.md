---
title: "Scenario Pipeline"
---

# Scenario Pipeline

The scenario pipeline is a maturity model for behavioral specifications. It tracks what you know about a behavior -- from a vague observation all the way to a verified implementation. The pipeline exists to enforce one discipline: **you cannot implement what you have not yet understood.**

This is not an AI feature. It is a team workflow tool. You can use it with sticky notes on a wall, shell scripts, or an AI agent. The stages are the discipline; the tooling is optional.

## Why stages matter

Most testing frameworks have two states: the test exists, or it does not. This creates pressure to write tests before understanding what they should verify. You end up with tests that encode guesses rather than agreements.

The pipeline introduces intermediate stages that force deliberate discovery. Each stage represents a level of understanding, and advancement between stages requires evidence that the understanding is real -- not assumed.

This is Liz Keogh's framing of deliberate discovery: you do not know what you do not know, and the only way to find out is to create structured opportunities for surprise. The pipeline is that structure. Questions block advancement. Ambiguity cannot be papered over. You must resolve what you do not understand before you are allowed to build.

The practical effect: speculative code does not get written. When a scenario is stuck at "mapped" because two questions remain open, nobody writes an adapter for it. The pipeline makes the cost of ignorance visible before it becomes the cost of rework.

## The five stages

### Captured

A behavior has been observed or intended, but not yet investigated. This is the raw material -- something someone noticed, a user story that arrived, a bug report that hints at missing coverage.

**What it means:** "We think this behavior exists (or should exist), but we have not looked closely."

**What triggers advancement:** Someone investigates the codebase, traces code paths, identifies seams and constraints. The scenario gains context about how the system actually works.

### Characterized

The behavior has been investigated. Code paths have been traced. You know what the system does today, where the seams are, and what constraints apply.

**What it means:** "We understand the current state. We have evidence, not just assumptions."

**What triggers advancement:** A human confirms intent. This is a hard block -- characterized scenarios cannot advance to mapped without a person (developer, tester, product owner) explicitly confirming that the characterization is accurate and the behavior is worth specifying.

### Mapped

The behavior has been through a structured conversation. Rules have been extracted, concrete examples generated, and questions captured. If you used Example Mapping, this is the stage where the cards hit the table. See the [Example Mapping](example-mapping) guide for the technique itself.

**What it means:** "The team agrees on the rules and has concrete examples. Open questions are tracked, not ignored."

**What triggers advancement:** All questions must be resolved. This is a hard block -- you cannot advance a mapped scenario to specified while any question remains open. Every red card must be answered before you move forward.

### Specified

The behavior has been expressed in domain vocabulary. Actions, queries, and assertions have been named. The domain model is designed, even if the adapter code does not yet exist.

**What it means:** "We know exactly what to build and have named every operation in domain language."

**What triggers advancement:** The scenario must be linked to at least one domain operation or test name in the codebase. This is a hard block -- specification without a connection to real code is just documentation.

### Implemented

Tests pass. The domain vocabulary is exercised through an adapter. The behavior is verified.

**What it means:** "This behavior is proven. It will break loudly if someone changes it."

## Hard blocks

Three transitions in the pipeline enforce hard blocks that cannot be bypassed:

| Transition | Requirement | Why |
|:-----------|:------------|:----|
| characterized to mapped | Human confirmation (`confirmedBy`) | A machine can characterize code, but only a person can confirm that the characterization matches intent. This is the human-in-the-loop checkpoint. |
| mapped to specified | All questions resolved | Unresolved questions mean unresolved ambiguity. Specifying vocabulary around ambiguity produces the wrong vocabulary. |
| specified to implemented | Domain link exists | A specification that is not connected to code is a specification that will drift. The link ensures the spec and the code stay coupled. |

These blocks are the pipeline's teeth. Without them, stages become suggestions. With them, each stage is a gate that requires real evidence to pass through.

## Using the pipeline

### With GitHub Issues scripts

The `@averspec/agent-plugin` package includes shell scripts that manage scenarios as GitHub Issues through the pipeline:

```bash
# Capture a new scenario
./packages/agent-plugin/scripts/gh/scenario-capture.sh "users can reset password via email"

# List all scenarios (filter by stage to see where everything stands)
./packages/agent-plugin/scripts/gh/scenario-list.sh
./packages/agent-plugin/scripts/gh/scenario-list.sh --stage captured

# Advance after investigation
./packages/agent-plugin/scripts/gh/scenario-advance.sh <id> --rationale "traced auth flow, found seam in AuthService" --by developer

# Record a question that blocks advancement
./packages/agent-plugin/scripts/gh/scenario-question.sh <id> "does the reset link expire after first use?"

# Resolve the question when answered
./packages/agent-plugin/scripts/gh/scenario-resolve.sh <id> <question-id> "yes, single-use, 24h expiry"
```

Scenarios are tracked as GitHub Issues with a `scenario` label and `stage:captured`, `stage:characterized`, `stage:mapped`, `stage:specified`, or `stage:implemented` labels. The scripts enforce the same hard blocks described above.

### Manually

The pipeline is a mental model. You can track stages on a whiteboard, in a spreadsheet, or with sticky notes. The discipline is what matters: do not implement what you have not mapped, do not map what you have not characterized, do not characterize what you have not captured.

## With a team

The pipeline maps naturally to collaborative practices:

**Example Mapping sessions** produce mapped scenarios. A small group spends 25 minutes extracting rules, generating examples, and capturing questions. The output is a set of scenarios at the mapped stage with rules, examples, and (ideally few) questions attached. See the [Example Mapping](example-mapping) guide.

**Specification sessions** produce domain vocabulary. Developers and testers name the actions, queries, and assertions that express the mapped rules. This is where the domain model takes shape.

**Implementation** follows test-driven development. Write the test using the specified vocabulary, then write the adapter that makes it pass. The scenario advances to implemented when the test is green and the domain link exists.

The pipeline gives each role a clear entry point: product owners confirm characterizations, the whole team maps together, developers specify vocabulary, and the test suite proves implementation.

## With an AI agent

The pipeline keeps an AI agent honest. Without it, an agent will happily generate tests for behaviors it does not understand, using vocabulary nobody agreed on. The hard blocks prevent this:

- The agent can capture and characterize freely -- investigation is what agents are good at.
- The agent cannot advance past characterized without a human confirming the characterization.
- The agent cannot advance past mapped until every question is answered.
- The agent can help specify vocabulary and implement tests, but always within the constraints the team has established.

The pipeline turns the agent from an autonomous code generator into a constrained collaborator. It writes code only for behaviors that have been understood, agreed upon, and specified.

See the [AI-Assisted Testing](ai-assisted) guide for setup and detailed usage with Claude Code.
