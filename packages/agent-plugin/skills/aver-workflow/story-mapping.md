# Story Mapping (Facilitated Session)

User Story Mapping (Jeff Patton) for slicing large features into scenarios. The agent facilitates the mapping; the human/team decides what to build and how to slice.

## When to Use

- A backlog item covers **many behaviors** and needs slicing before Example Mapping
- The scope of a feature is **unclear** — you need to see the whole picture before diving in
- The team needs to **prioritize** — which behaviors are MVP, which can wait?
- A new user-facing workflow spans **multiple steps** that could each be scenarios

**Skip to Example Mapping** when a backlog item is a single well-understood behavior. Story Mapping adds overhead that isn't needed for focused work.

## What Story Mapping Produces

A **map** of user activities → steps → details, organized left-to-right (time) and top-to-bottom (priority). Each detail below the MVP line becomes a candidate scenario via `scenario-capture.sh`.

## Facilitation Flow

### 1. Frame the User Activity

Start from the user's perspective — what are they trying to accomplish?

Say to the human:
> "Let's map out **[feature/backlog item]** from the user's perspective.
>
> Before we start — who else should be in this session? Story Mapping works best with multiple perspectives (Three Amigos: product owner, tester, developer).
>
> Who is the user? What's the activity they're trying to complete?
> For example: 'A team lead managing their sprint board' or 'A customer checking out their cart.'
>
> What's the first thing they do?"

### 2. Walk the Backbone

Map the high-level steps left to right. These are the major actions in the user's journey.

Say to the human:
> "Let's walk through the steps. I'll propose and you correct:
>
> 1. [First step] — is this right?
> 2. What happens next?
> 3. And after that?
>
> We're looking for the 'big steps' — not every click, but each meaningful action."

Keep asking "What happens next?" and "What could go wrong here?" until the backbone is complete.

### 3. Add Details Under Each Step

For each backbone step, explore the details — variations, error cases, edge cases.

Say to the human:
> "Under **[step]**, what are the details?
> - What's the happy path?
> - What could go wrong?
> - Are there variations? (different user roles, different data states)
> - What's essential vs. nice-to-have?"

Organize details vertically by priority — essential at the top, nice-to-have at the bottom.

### 4. Draw the MVP Line

This is the key facilitation moment. Help the team decide what's in scope for the first slice.

Say to the human:
> "Looking at the map, where's the MVP line? Everything above it ships first. Everything below it waits.
>
> Here's what I see as essential:
> - [detail 1 under step A]
> - [detail 2 under step B]
> - [detail 3 under step C]
>
> And these could wait:
> - [detail 4]
> - [detail 5]
>
> Does that match your priority? What would you move up or down?"

### 5. Slice into Scenarios

Each detail above the MVP line becomes a candidate scenario.

Say to the human:
> "From the MVP slice, I see [N] distinct behaviors to capture as scenarios:
>
> 1. **[behavior]** — from [step]: [detail]
> 2. **[behavior]** — from [step]: [detail]
> 3. **[behavior]** — from [step]: [detail]
>
> Should I capture these? Any that should be combined or split differently?"

For each confirmed behavior, run `packages/agent-plugin/scripts/gh/scenario-capture.sh --title "..." --body "..."` with:
- the detail description in domain language
- the backbone step it belongs to
- the backlog item / feature name
- mode: `intended` (these are new behaviors, not observed ones)

### 6. Bridge to Example Mapping

Each captured scenario becomes an Example Mapping session.

Say to the human:
> "I've captured [N] scenarios from our Story Map. Each one needs an Example Mapping session to define rules, examples, and questions.
>
> Which one should we start with? I'd suggest **[scenario]** because [reason — foundational behavior, most uncertain, blocking others]."

Link each scenario to the backlog item using `packages/agent-plugin/scripts/gh/backlog-update.sh` with the scenario issue numbers.

## When Story Mapping Surfaces Questions

Story Mapping often reveals uncertainties at a higher level than Example Mapping:
- "Do we even need this step?"
- "Which user role does this?"
- "Is this in scope?"

These become questions on the **backlog item** (via description updates), not on individual scenarios. They're strategic questions, not behavioral ones.

## Anti-Patterns

- **Jumping to details too early.** Walk the backbone first. Details without context are confusing.
- **Mapping implementation steps, not user steps.** "Write database migration" is not a user step. "Create a task" is.
- **Skipping the MVP line.** Without prioritization, everything feels essential. Draw the line explicitly.
- **Creating scenarios for below-the-line details.** Capture only what's in the current slice. Below-the-line details stay on the map for future slices.
- **Running Story Mapping for a single behavior.** If the backlog item is one thing, skip to Example Mapping.
- **Deciding scope without the human.** The agent proposes the MVP line; the human draws it.
