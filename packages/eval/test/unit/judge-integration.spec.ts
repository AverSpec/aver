import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { judge, createJudge, setDefaultProvider, resetDefaultProvider } from '../../src/judge'
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

  afterEach(() => {
    resetDefaultProvider()
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
    resetDefaultProvider()
    await expect(judge('content', 'rubric')).rejects.toThrow()
  })
})

describe('createJudge()', () => {
  afterEach(() => {
    resetDefaultProvider()
  })

  it('returns a bound judge function that uses the given provider', async () => {
    const provider = mockProvider([
      { match: 'seams', verdict: { pass: true, reasoning: 'References seams.' } },
    ])
    const boundJudge = createJudge(provider)

    const verdict = await boundJudge('content about seams', 'References seams')
    expect(verdict.pass).toBe(true)
    expect(verdict.reasoning).toBe('References seams.')
  })

  it('is isolated from the default provider', async () => {
    setDefaultProvider(
      mockProvider([
        { match: 'default', verdict: { pass: true, reasoning: 'From default.' } },
      ]),
    )

    const boundJudge = createJudge(
      mockProvider([
        { match: 'custom', verdict: { pass: false, reasoning: 'From custom.' } },
      ]),
    )

    // bound judge uses its own provider, not the default
    const verdict = await boundJudge('custom content', 'custom rubric')
    expect(verdict.pass).toBe(false)
    expect(verdict.reasoning).toBe('From custom.')

    // default judge still uses its own provider
    const defaultVerdict = await judge('default content', 'default rubric')
    expect(defaultVerdict.pass).toBe(true)
    expect(defaultVerdict.reasoning).toBe('From default.')
  })
})
