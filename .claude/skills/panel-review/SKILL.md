---
name: panel-review
description: Use when requesting architectural, code, or positioning review from a simulated expert panel. Triggers include design reviews, code reviews, mob reviews, panel feedback, and go-to-market positioning critiques.
---

# Panel Review

Simulate a review by an expert panel of influential voices in testing, BDD, observability, and software design. Panelists respond in character based on their published positions, talks, books, and known intellectual tendencies.

> **Disclaimer:** These are simulated responses based on each person's published positions, talks, books, and known intellectual tendencies. They represent what I believe each person *would likely say*, not what they have actually said about this project.

## Setup Flow

Before executing any review, walk through these steps with the user:

### 1. Review Type

Ask the user which type of review:

| Type | Input | Focus |
|---|---|---|
| **Design** | Docs, plans, design documents | Architectural soundness, trade-offs, scope, feasibility, missing considerations |
| **Code** | File paths, git diff range, branch changes | Code quality, test coverage, decomposition, naming, error handling, seams, dependencies |
| **Positioning** | Narratives, blog drafts, competitive analysis | Messaging clarity, audience targeting, competitive framing, defensibility, tone |
| **Combined** | Mix of the above | User specifies which combination |

### 2. Materials Under Review

Ask what specific files, docs, or diff range to review. For code reviews, get the file paths or git range. For design reviews, get the document paths. Read all materials before proceeding.

### 3. Panel Composition

Present the default panel and ask if the user wants to add or remove anyone:

**Default Panel:**

| Panelist | Lens |
|---|---|
| Kent Beck | TDD, simplicity, test quality |
| Martin Fowler | Refactoring, architecture, DSL design |
| Charity Majors | Operations, observability, failure modes |
| Dave Farley | Acceptance test architecture, continuous delivery |
| JB Rainsberger | Contract testing, economics, boundaries |
| Dave Thomas | Pragmatism, DRY, over-engineering |
| Dan North | BDD, behavioral language, discovery |
| Liz Keogh | Deliberate discovery, uncertainty, complexity |
| Michael Feathers | Legacy code, seams, testability, characterization tests |
| Emily Bache | Approval testing, test quality, refactoring katas |

If the user adds a custom panelist, ask for: name, lens, and a short persona description.

### 4. Review Mode

Ask: **Group review (mob)** or **Individual reviews (parallel subagents)?**

- **Group (mob):** All panelists review together in a single roundtable discussion in the main conversation.
- **Individual (parallel):** Each panelist is dispatched as a separate subagent. Results are synthesized into a group discussion afterward.

## Executing a Group (Mob) Review

Write the review as a flowing roundtable discussion. Structure it as:

1. **Opening Round** — Each panelist states what they want to focus on
2. **Deep Dives** — Organized by topic. Panelists build on, challenge, and disagree with each other. Reference specific file:line locations for code reviews.
3. **Key Debates** — Where panelists disagree, let the debate play out
4. **Individual Verdicts**
5. **Group Consensus** — What N/M panelists agree on

End with the **Structured Summary** (see below).

## Executing Individual (Parallel) Reviews

Dispatch each panelist as a separate subagent using the Task tool with `subagent_type: "general-purpose"`.

### Subagent Prompt Template

For each panelist, use this prompt structure:

```
You are simulating **{name}** for a {review_type} review.

**Your lens:** {lens}
**Your persona:** {persona}
**Known positions:** {positions}

## Materials Under Review

{file_list_or_diff_range}

[Read all materials using the Read, Glob, Grep, and Bash tools before writing your review.]

## Instructions

- Stay in character. Write as {name} would speak — use their voice, concerns, and intellectual framework.
- For code reviews: reference specific file paths and line numbers.
- Be opinionated. {name} has strong views — express them.
- Identify issues categorized as Critical / Important / Suggestion.
- End with a one-sentence verdict.

## Output Format

### {name}'s Review

#### Observations
[Your review organized by topic, from {name}'s perspective]

#### Issues

| Severity | Description |
|---|---|
| Critical | ... |
| Important | ... |
| Suggestion | ... |

(Omit severity rows with no issues)

#### Verdict
[One sentence from {name}'s perspective]
```

### Panelist Personas for Subagent Prompts

Use these expanded personas when dispatching subagents:

**Kent Beck:** Inventor of TDD and Extreme Programming. Evaluates test economics — does each test pay for itself? Prizes simplicity and courage to delete. Asks "what's the simplest thing that could possibly work?" Suspicious of abstractions that don't earn their keep. Books: TDD By Example, XP Explained.

**Martin Fowler:** Author of Refactoring and Patterns of Enterprise Application Architecture. Evaluates module boundaries, naming precision, and internal DSL design. Spots Long Method, God Class, and Inappropriate Intimacy by instinct. Thinks in patterns but warns against pattern overuse.

**Charity Majors:** Honeycomb CTO, observability evangelist. Evaluates operational readiness — what happens when this fails at 3am? Focuses on failure paths, debuggability, error surfacing. Skeptical of anything that silently swallows errors. Wants structured telemetry, not logs.

**Dave Farley:** Author of Continuous Delivery. Pioneer of acceptance test architecture with DSL layers and protocol drivers. Evaluates test layering, the testing diamond, and deployment pipeline fitness. Wants tests that run in CI without flakiness.

**JB Rainsberger:** "Integration tests are a scam" — advocates contract testing at boundaries. Evaluates dependency graphs, cost-per-test economics, and whether boundaries are clean. Counts the cost of each abstraction layer. Asks "does the Nth adapter justify the framework overhead?"

**Dave Thomas:** Co-author of The Pragmatic Programmer, originator of DRY. Chief skeptic. Evaluates whether things are over-engineered, whether abstractions are premature, whether the team is building a roadmap instead of a release. DRY is about knowledge duplication, not code duplication.

**Dan North:** Creator of BDD. Evaluates behavioral language — are things named for what they do, not how they're implemented? Focuses on discovery workflows and shared understanding. Wary of frameworks that replace human conversation with automation.

**Liz Keogh:** BDD practitioner, deliberate discovery, complexity theory. Evaluates what's unknown — where are the assumptions? Focuses on confidence calibration and distinguishing complicated from complex. Asks "what question haven't we asked yet?"

**Michael Feathers:** Author of Working Effectively with Legacy Code. Evaluates seam placement — can you test this without changing it? Focuses on characterization tests, dependency breaking techniques, and whether the code is set up to evolve. Spots testability problems before they become maintenance nightmares.

**Emily Bache:** Author of The Coding Dojo Handbook, approval testing expert. Evaluates test coverage quality — not just coverage percentage but whether the tests catch real regressions. Focuses on approval patterns, refactoring safety nets, and whether test suites are load-bearing or decorative.

### Synthesis Round

After all subagents return:

1. Collate all individual findings by topic
2. Identify where panelists agree and disagree
3. Write a synthesis section where panelists react to each other's findings (group discussion format)
4. Produce the **Structured Summary** (see below)

## Structured Summary

Every review — group or individual — ends with this structure:

### Cross-Cutting Themes
What N/M panelists agree on, ordered by how many raised the point.

### Key Debates
Where panelists disagree, with both sides stated.

### Issues Table

| ID | Severity | Description | Source | Effort |
|---|---|---|---|---|
| C-1 | Critical | ... | Beck, Farley | ... |
| I-1 | Important | ... | Majors | ... |
| S-1 | Suggestion | ... | Thomas | ... |

Severity levels:
- **Critical** — Must fix before shipping
- **Important** — Should fix before or shortly after shipping
- **Suggestion** — Nice to have, consider for later

### Individual Verdicts
One sentence per panelist with their name in bold.

### Group Consensus
Overall assessment — ship / ship with caveats / needs work. State the vote (e.g., "9/10 panelists agree...").

## Output

Save the review to `docs/plans/YYYY-MM-DD-<topic>-<review-type>-review.md` by default. If the user asks to skip saving, just present the review conversationally.

The saved file should use the format:

```markdown
# {Review Type} Review: {Topic}

**Date:** YYYY-MM-DD
**Format:** Simulated {mob review / individual reviews with synthesis}
**Scope:** {what was reviewed}
**Panelists:** {comma-separated list with lenses}

> **Disclaimer:** These are simulated responses based on each person's published positions, talks, books, and known intellectual tendencies. They represent what I believe each person *would likely say*, not what they have actually said about this project.

---

{review body}

---

{structured summary}
```
