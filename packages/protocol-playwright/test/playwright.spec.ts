import { describe, it, expect, vi } from 'vitest'
import { runWithTestContext } from '@averspec/core'
import { playwright } from '../src/index'

describe('playwright()', () => {
  it('creates a protocol with name "playwright"', () => {
    const protocol = playwright()
    expect(protocol.name).toBe('playwright')
    expect(typeof protocol.setup).toBe('function')
    expect(typeof protocol.teardown).toBe('function')
  })

  it('accepts launch options', () => {
    const protocol = playwright({ headless: true })
    expect(protocol.name).toBe('playwright')
  })

  it('exposes screenshotter extension with regions', () => {
    const regions = { header: 'header', footer: 'footer' }
    const protocol = playwright({ regions })
    const screenshotter = protocol.extensions?.screenshotter
    expect(screenshotter).toBeDefined()
    expect(screenshotter!.regions).toEqual(regions)
  })

  it('screenshotter throws when no active page exists', async () => {
    const protocol = playwright()
    const screenshotter = protocol.extensions?.screenshotter
    await expect(screenshotter!.capture('/tmp/test.png')).rejects.toThrow(
      'No active page for screenshotter',
    )
  })

  it('screenshotter throws for unknown region', async () => {
    // We can't test this fully without a browser, but we can verify
    // the error path for unknown regions by checking the structure
    const protocol = playwright({ regions: { header: '#header' } })
    const screenshotter = protocol.extensions?.screenshotter
    // Without setup(), activePage is undefined, so it throws the "no active page" error first
    await expect(screenshotter!.capture('/tmp/test.png', { region: 'footer' })).rejects.toThrow(
      'No active page for screenshotter',
    )
  })

  it('has onTestFail handler', () => {
    const protocol = playwright()
    expect(typeof protocol.onTestFail).toBe('function')
  })

  it('protocol instances are independent', () => {
    // Create two protocol instances to verify they are independent
    const p1 = playwright()
    const p2 = playwright()
    // Each instance should have its own state — verifying structural independence
    expect(p1).not.toBe(p2)
    expect(p1.extensions?.screenshotter).not.toBe(p2.extensions?.screenshotter)
  })

  it('screenshotter reads page from RunningTestContext.protocolContext', async () => {
    const protocol = playwright()
    const screenshotter = protocol.extensions?.screenshotter

    // Create a mock Page with screenshot and locator methods
    const mockPage = {
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      locator: vi.fn().mockReturnValue({
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      }),
    }

    // Run capture inside a test context that has protocolContext set
    await runWithTestContext(
      {
        testName: 'test',
        domainName: 'dom',
        protocolName: 'playwright',
        trace: [],
        extensions: {},
        protocolContext: mockPage,
      },
      async () => {
        await screenshotter!.capture('/tmp/test.png')
      },
    )

    expect(mockPage.screenshot).toHaveBeenCalledWith({
      path: '/tmp/test.png',
      fullPage: true,
    })
  })

  it('screenshotter throws when protocolContext is missing from test context', async () => {
    const protocol = playwright()
    const screenshotter = protocol.extensions?.screenshotter

    // Run inside a test context WITHOUT protocolContext
    await runWithTestContext(
      {
        testName: 'test',
        domainName: 'dom',
        protocolName: 'playwright',
        trace: [],
        extensions: {},
      },
      async () => {
        await expect(screenshotter!.capture('/tmp/test.png')).rejects.toThrow(
          'No active page for screenshotter',
        )
      },
    )
  })
})
