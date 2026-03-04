# @aver/eval

> **Status: Experimental** — API may change before 1.0

LLM output evaluation judge — verdict scoring against rubrics.

## What it does

`@aver/eval` provides a provider-based judge that evaluates LLM outputs against specific criteria (rubrics) and returns structured verdicts with pass/fail, reasoning, and confidence.

## Install

```bash
npm install @aver/eval
```

## Quick start

```ts
import { judge, setDefaultProvider, mockProvider } from '@aver/eval'

// For tests — deterministic, no LLM calls
setDefaultProvider(mockProvider([
  { match: 'domain language', verdict: { pass: true, reasoning: 'Uses domain terms.', confidence: 'high' } },
]))

const verdict = await judge('Output referencing domain language', 'Uses domain language')
console.log(verdict.pass)       // true
console.log(verdict.reasoning)  // 'Uses domain terms.'
console.log(verdict.confidence) // 'high'
```

## Providers

### Mock provider (testing)

Zero external dependencies. Match rubric text against canned verdicts:

```ts
import { mockProvider, setDefaultProvider } from '@aver/eval'

setDefaultProvider(mockProvider([
  { match: 'seams', verdict: { pass: true, reasoning: 'Found seams.', confidence: 'high' } },
  { match: 'hallucin', verdict: { pass: true, reasoning: 'No hallucinations.', confidence: 'high' } },
]))
```

### Agent SDK provider (real LLM)

Uses Claude via `@anthropic-ai/claude-agent-sdk` with structured output:

```ts
import { agentSdkProvider, setDefaultProvider } from '@aver/eval'

setDefaultProvider(agentSdkProvider({
  model: 'claude-haiku-4-5-20251001', // default
}))
```

### Custom providers

Implement the `JudgeProvider` interface:

```ts
import type { JudgeProvider, Verdict } from '@aver/eval'

const myProvider: JudgeProvider = {
  async judge(content: string, rubric: string): Promise<Verdict> {
    // Your LLM call here
    return { pass: true, reasoning: '...', confidence: 'high' }
  }
}
```

## API

| Export | Description |
|--------|-------------|
| `judge(content, rubric)` | Evaluate content against a rubric using the default provider |
| `setDefaultProvider(provider)` | Set the default judge provider |
| `resetDefaultProvider()` | Clear the default provider |
| `mockProvider(rules)` | Create a deterministic mock provider |
| `agentSdkProvider(opts?)` | Create a Claude Agent SDK provider |
| `VerdictSchema` | Zod schema for verdict validation |
| `buildJudgePrompt(content, rubric)` | Build the prompt sent to the LLM |
| `JUDGE_SYSTEM_PROMPT` | The system prompt used by the judge |

## Verdict shape

```ts
{
  pass: boolean
  reasoning: string          // non-empty explanation
  confidence: 'high' | 'medium' | 'low'
}
```
