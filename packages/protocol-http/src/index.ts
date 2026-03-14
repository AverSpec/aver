import type { Protocol } from '@averspec/core'

export interface HttpContext {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
  put(path: string, body?: unknown): Promise<Response>
  patch(path: string, body?: unknown): Promise<Response>
  delete(path: string): Promise<Response>
}

export interface HttpOptions {
  baseUrl: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Default headers to include with every request */
  defaultHeaders?: Record<string, string>
}

/**
 * Wraps an HttpContext so that any thrown errors are prefixed with the given
 * action name. Useful in adapter code to surface which domain action failed.
 *
 * @example
 * const res = await withAction('add item', ctx).post('/api/cart', payload)
 */
export function withAction(actionName: string, ctx: HttpContext): HttpContext {
  const wrap =
    (method: keyof HttpContext) =>
    async (...args: [string, unknown?]): Promise<Response> => {
      try {
        return await (ctx[method] as (...a: unknown[]) => Promise<Response>)(
          ...args,
        )
      } catch (err) {
        const original = err instanceof Error ? err : new Error(String(err))
        throw new Error(
          `Action "${actionName}" failed: ${original.message}`,
          { cause: original },
        )
      }
    }

  return {
    get: wrap('get') as HttpContext['get'],
    post: wrap('post') as HttpContext['post'],
    put: wrap('put') as HttpContext['put'],
    patch: wrap('patch') as HttpContext['patch'],
    delete: wrap('delete') as HttpContext['delete'],
  }
}

export function http(options: HttpOptions): Protocol<HttpContext> {
  const timeout = options.timeout ?? 30_000
  const defaultHeaders = options.defaultHeaders ?? {}

  return {
    name: 'http',
    async setup(): Promise<HttpContext> {
      const base = options.baseUrl.replace(/\/$/, '')

      function request(method: string) {
        return async (path: string, body?: unknown): Promise<Response> => {
          const url = `${base}${path}`
          const controller = new AbortController()
          const timer = setTimeout(
            () => controller.abort(new Error(`Request timed out after ${timeout}ms`)),
            timeout,
          )
          try {
            const response = await fetch(url, {
              method,
              headers: {
                ...defaultHeaders,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
              },
              body: body !== undefined ? JSON.stringify(body) : undefined,
              signal: controller.signal,
            })
            return response
          } catch (err) {
            const original = err instanceof Error ? err : new Error(String(err))
            throw new Error(
              `fetch to ${url} failed: ${original.message}`,
              { cause: original },
            )
          } finally {
            clearTimeout(timer)
          }
        }
      }

      return {
        get: request('GET'),
        post: request('POST'),
        put: request('PUT'),
        patch: request('PATCH'),
        delete: request('DELETE'),
      }
    },
    async teardown() {},
  }
}
