/**
 * Extract a JSON object from LLM output text.
 *
 * Strategies (in order):
 * 1. Markdown code block: ```json ... ```
 * 2. Brace matching with string-literal awareness (handles { } inside strings)
 * 3. Fall through to returning the raw text (caller's JSON.parse will give a clear error)
 */
export function extractJson(text: string): string {
  // Strategy 1: markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  // Strategy 2: brace matching with string awareness
  const jsonStart = text.indexOf('{')
  if (jsonStart >= 0) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i]

      if (escaped) {
        escaped = false
        continue
      }

      if (ch === '\\' && inString) {
        escaped = true
        continue
      }

      if (ch === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === '{') depth++
      if (ch === '}') depth--
      if (depth === 0) return text.slice(jsonStart, i + 1)
    }
  }

  // Strategy 3: return raw text — let JSON.parse provide the error
  return text
}
