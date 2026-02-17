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
}

export function http(options: HttpOptions): Protocol<HttpContext> {
  return {
    name: 'http',
    async setup(): Promise<HttpContext> {
      const base = options.baseUrl.replace(/\/$/, '')

      function request(method: string) {
        return async (path: string, body?: unknown): Promise<Response> => {
          return fetch(`${base}${path}`, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined,
          })
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
