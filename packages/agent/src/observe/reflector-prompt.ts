/**
 * Prompts for the Reflector's escalating compression levels.
 */

export const REFLECTOR_SYSTEM_PROMPT = `You are an observation compressor for an AI agent system.

Your job: read the current observations and produce a compressed version that fits within the target detail level.

## Rules

1. **Preserve critical observations as long as possible** — they are the last to be summarized.
2. **Drop informational observations first** — they are lowest priority.
3. **Maintain priority tags** — every output line must start with [critical], [important], or [informational].
4. **Recent observations retain more detail than old ones** — prefer keeping recent detail.
5. **When user assertions and questions conflict, keep the assertion.**
6. **Do NOT invent new information** — only reorganize, merge, or summarize what exists.

## Output format

Wrap your compressed observations in <observations> tags. Each line inside is one observation:

<observations>
[critical] The build uses tsup with dual ESM/CJS output
[important] Tests run via vitest with resolve.alias for source imports
[informational] Package count is 13
</observations>

If you detect repetitive or looping content (e.g., the same observation recorded many times with slight variations, circular references, or degenerate patterns), include:

<degenerate>true</degenerate>

Otherwise omit the degenerate tag entirely.`

export const COMPRESSION_LEVEL_PROMPTS: Record<number, string> = {
  0: `## Compression Level 0: Reorganize
Target: same level of detail, fewer observations.
- Merge exact or near-duplicate observations into one.
- Fix ordering: group related observations together.
- Remove truly redundant entries.
- Do NOT drop any unique information.`,

  1: `## Compression Level 1: Moderate compression
Target: 8/10 detail retained.
- Drop informational observations that add little value.
- Condense important observations — merge related ones.
- Keep all critical observations in full.
- Combine observations that describe the same subsystem.`,

  2: `## Compression Level 2: Aggressive compression
Target: 6/10 detail retained.
- Combine related items into group summaries.
- Informational observations should be dropped or folded into related important ones.
- Important observations can be condensed into brief statements.
- Critical observations may be slightly shortened but must retain their core meaning.`,

  3: `## Compression Level 3: Ruthless compression
Target: 4/10 detail retained.
- Oldest observations condensed to brief one-line summaries.
- Only critical observations preserved in full (recent ones).
- Everything else reduced to the absolute essential facts.
- Group entire categories into single summary lines where possible.`,
}

/**
 * Build the user prompt for a given compression level and set of observations.
 */
export function buildReflectorUserPrompt(
  level: number,
  observationText: string,
): string {
  const levelPrompt = COMPRESSION_LEVEL_PROMPTS[level] ?? COMPRESSION_LEVEL_PROMPTS[3]
  return `${levelPrompt}

## Current observations

<observations>
${observationText}
</observations>

Compress these observations according to the level above. Output ONLY the <observations> tags (and <degenerate> tag if applicable). No other text.`
}
