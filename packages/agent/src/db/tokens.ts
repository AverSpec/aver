/**
 * Estimate token count from text.
 * Uses character-based heuristic (chars / 4) — sufficient for threshold decisions.
 * Can be swapped to tiktoken later if precision matters.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}
