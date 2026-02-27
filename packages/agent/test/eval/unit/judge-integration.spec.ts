import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { judge, setDefaultProvider, resetDefaultProvider } from '../../../src/eval/judge'
import { mockProvider } from '../../../src/eval/providers/mock'

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

describe('provider.judge() direct usage (replaces createJudge)', () => {
  afterEach(() => {
    resetDefaultProvider()
  })

  it('calls provider.judge() directly without a wrapper', async () => {
    const provider = mockProvider([
      { match: 'seams', verdict: { pass: true, reasoning: 'References seams.' } },
    ])

    const verdict = await provider.judge('content about seams', 'References seams')
    expect(verdict.pass).toBe(true)
    expect(verdict.reasoning).toBe('References seams.')
  })

  it('provider.judge() is isolated from the default provider', async () => {
    setDefaultProvider(
      mockProvider([
        { match: 'default', verdict: { pass: true, reasoning: 'From default.' } },
      ]),
    )

    const customProvider = mockProvider([
      { match: 'custom', verdict: { pass: false, reasoning: 'From custom.' } },
    ])

    // direct provider call uses its own rules, not the default
    const verdict = await customProvider.judge('custom content', 'custom rubric')
    expect(verdict.pass).toBe(false)
    expect(verdict.reasoning).toBe('From custom.')

    // default judge still uses its own provider
    const defaultVerdict = await judge('default content', 'default rubric')
    expect(defaultVerdict.pass).toBe(true)
    expect(defaultVerdict.reasoning).toBe('From default.')
  })
})
