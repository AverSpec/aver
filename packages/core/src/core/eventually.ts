/**
 * Retry a function until it passes or timeout is reached.
 * Designed for eventually-consistent assertions in adapter handlers.
 *
 * @example
 * ```typescript
 * orderConfirmed: async (ctx, { orderId }) => {
 *   await eventually(async () => {
 *     const res = await ctx.get(`/orders/${orderId}`)
 *     expect(res.status).toBe('confirmed')
 *   })
 * }
 * ```
 */
export async function eventually(
  fn: () => Promise<void> | void,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5000
  const interval = options?.interval ?? 100
  const start = Date.now()
  let lastError: unknown
  let retries = 0

  while (Date.now() - start < timeout) {
    try {
      await fn()
      return
    } catch (err) {
      lastError = err
      retries++
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }

  // One final attempt after timeout
  try {
    await fn()
    return
  } catch (err) {
    lastError = err
    retries++
  }

  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError)
  const error = new Error(
    `Timed out after ${timeout}ms (${retries} retries). Last failure: ${lastMessage}`,
  )
  error.cause = lastError
  throw error
}
