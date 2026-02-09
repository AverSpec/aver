import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export interface DomainConfig<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any>>,
  S extends Record<string, AssertionMarker<any>>,
> {
  name: string
  actions: A
  queries: Q
  assertions: S
}

export interface Domain<
  A extends Record<string, ActionMarker<any>> = Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any>> = Record<string, QueryMarker<any>>,
  S extends Record<string, AssertionMarker<any>> = Record<string, AssertionMarker<any>>,
> {
  readonly name: string
  readonly vocabulary: {
    readonly actions: A
    readonly queries: Q
    readonly assertions: S
  }
  readonly parent?: Domain<any, any, any>
  extend<_Protocol = unknown>(extension: {
    actions?: Record<string, ActionMarker<any>>
    queries?: Record<string, QueryMarker<any>>
    assertions?: Record<string, AssertionMarker<any>>
  }): Domain<
    A & Record<string, ActionMarker<any>>,
    Q & Record<string, QueryMarker<any>>,
    S & Record<string, AssertionMarker<any>>
  >
}

export function defineDomain<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any>>,
  S extends Record<string, AssertionMarker<any>>,
>(config: DomainConfig<A, Q, S>): Domain<A, Q, S> {
  const domain: Domain<A, Q, S> = {
    name: config.name,
    vocabulary: {
      actions: config.actions,
      queries: config.queries,
      assertions: config.assertions,
    },
    extend<_Protocol = unknown>(extension: {
      actions?: Record<string, ActionMarker<any>>
      queries?: Record<string, QueryMarker<any>>
      assertions?: Record<string, AssertionMarker<any>>
    }) {
      return {
        name: config.name,
        vocabulary: {
          actions: { ...config.actions, ...(extension.actions ?? {}) },
          queries: { ...config.queries, ...(extension.queries ?? {}) },
          assertions: { ...config.assertions, ...(extension.assertions ?? {}) },
        },
        parent: domain,
        extend: domain.extend,
      } as any
    },
  }

  return domain
}
