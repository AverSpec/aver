import { describe, it, expect, beforeEach } from 'vitest'
import { judge, setDefaultProvider } from '../../src/judge'
import { mockProvider } from '../../src/providers/mock'

describe('judge() with mock provider', () => {
  beforeEach(() => {
    setDefaultProvider(
      mockProvider([
        { match: 'references seams', verdict: { pass: true, reasoning: 'Seams are referenced.' } },
        { match: 'no hallucin', verdict: { pass: true, reasoning: 'No hallucinations detected.' } },
        { match: 'actionable', verdict: { pass: false, reasoning: 'Rules are too abstract.' } },
      ]),
    )
  })

  it('returns pass for matching rubric', async () => {
    const verdict = await judge('Worker output with CartService.addItem', 'Output references seams')
    expect(verdict.pass).toBe(true)
    expect(verdict.reasoning).toContain('Seams')
  })

  it('returns fail for failing rubric', async () => {
    const verdict = await judge('Abstract rules here', 'Rules are actionable and specific')
    expect(verdict.pass).toBe(false)
  })

  it('returns fail for unmatched rubric', async () => {
    const verdict = await judge('content', 'Completely unrelated criterion')
    expect(verdict.pass).toBe(false)
    expect(verdict.reasoning).toContain('No matching mock')
  })

  it('throws when no provider is set', async () => {
    setDefaultProvider(undefined as any)
    await expect(judge('content', 'rubric')).rejects.toThrow()
  })
})
