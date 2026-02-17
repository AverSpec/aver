import { describe, it, expect } from 'vitest'
import { runWithTestContext, getTestContext } from '../../src/core/test-context'

describe('RunningTestContext', () => {
  it('returns undefined outside a test context', () => {
    expect(getTestContext()).toBeUndefined()
  })

  it('provides context within runWithTestContext', async () => {
    const trace: any[] = []
    await runWithTestContext(
      {
        testName: 'my test',
        domainName: 'MyDomain',
        protocolName: 'unit',
        trace,
        extensions: {},
      },
      async () => {
        const ctx = getTestContext()
        expect(ctx).toBeDefined()
        expect(ctx!.testName).toBe('my test')
        expect(ctx!.domainName).toBe('MyDomain')
        expect(ctx!.protocolName).toBe('unit')
        expect(ctx!.trace).toBe(trace)
      },
    )
  })

  it('exposes protocol extensions', async () => {
    const mockScreenshotter = { capture: async () => {} }
    await runWithTestContext(
      {
        testName: 'test',
        domainName: 'D',
        protocolName: 'playwright',
        trace: [],
        extensions: { screenshotter: mockScreenshotter },
      },
      async () => {
        const ctx = getTestContext()
        expect(ctx!.extensions.screenshotter).toBe(mockScreenshotter)
      },
    )
  })

  it('returns undefined after context exits', async () => {
    await runWithTestContext(
      { testName: 't', domainName: 'd', protocolName: 'p', trace: [], extensions: {} },
      async () => {},
    )
    expect(getTestContext()).toBeUndefined()
  })
})
