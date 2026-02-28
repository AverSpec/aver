/**
 * Wraps an async iterable so that iteration aborts when either:
 *   (a) the `totalSignal` fires (overall deadline), or
 *   (b) a single `next()` call takes longer than `turnTimeoutMs`.
 */
export async function* withAbort<T>(
  iter: AsyncIterable<T>,
  totalSignal: AbortSignal,
  turnTimeoutMs: number,
): AsyncGenerator<T> {
  if (totalSignal.aborted) {
    throw totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Aborted')
  }

  const it = iter[Symbol.asyncIterator]()

  try {
    while (true) {
      const turnController = new AbortController()

      const onTotalAbort = () =>
        turnController.abort(
          totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Total timeout'),
        )
      if (totalSignal.aborted) {
        throw totalSignal.reason instanceof Error ? totalSignal.reason : new Error('Total timeout')
      }
      totalSignal.addEventListener('abort', onTotalAbort, { once: true })

      const turnTimer = setTimeout(() => {
        turnController.abort(
          new Error(`Turn timed out after ${turnTimeoutMs}ms`),
        )
      }, turnTimeoutMs)

      let result: IteratorResult<T>
      try {
        result = await Promise.race([
          it.next(),
          new Promise<never>((_, reject) => {
            if (turnController.signal.aborted) {
              reject(
                turnController.signal.reason instanceof Error
                  ? turnController.signal.reason
                  : new Error('Aborted'),
              )
              return
            }
            const onAbort = () =>
              reject(
                turnController.signal.reason instanceof Error
                  ? turnController.signal.reason
                  : new Error('Aborted'),
              )
            turnController.signal.addEventListener('abort', onAbort, { once: true })
          }),
        ])
      } finally {
        clearTimeout(turnTimer)
        totalSignal.removeEventListener('abort', onTotalAbort)
      }

      if (result.done) break
      yield result.value
    }
  } finally {
    it.return?.()
  }
}
