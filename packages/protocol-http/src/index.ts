import type { Protocol } from '@aver/core'

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

export function http(options: HttpOptions): Protocol<HttpContext> {
  const timeout = options.timeout ?? 30_000
  const defaultHeaders = options.defaultHeaders ?? {}

  return {
    name: 'http',
    async setup(): Promise<HttpContext> {
      const base = options.baseUrl.replace(/\/$/, '')

      function request(method: string) {
        return async (path: string, body?: unknown): Promise<Response> => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeout)
          try {
            return await fetch(`${base}${path}`, {
              method,
              headers: {
                ...defaultHeaders,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
              },
              body: body !== undefined ? JSON.stringify(body) : undefined,
              signal: controller.signal,
            })
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
