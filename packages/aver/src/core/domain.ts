import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export interface DomainConfig<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
> {
  name: string
  actions: A
  queries: Q
  assertions: S
}

export interface Domain<
  A extends Record<string, ActionMarker<any>> = Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>> = Record<string, QueryMarker<any, any>>,
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
    queries?: Record<string, QueryMarker<any, any>>
    assertions?: Record<string, AssertionMarker<any>>
  }): Domain<
    A & Record<string, ActionMarker<any>>,
    Q & Record<string, QueryMarker<any, any>>,
    S & Record<string, AssertionMarker<any>>
  >
}

function makeDomain<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
>(
  name: string,
  vocab: { actions: A; queries: Q; assertions: S },
  parent?: Domain<any, any, any>,
): Domain<A, Q, S> {
  const domain: Domain<A, Q, S> = {
    name,
    vocabulary: vocab,
    parent,
    extend(extension) {
      return makeDomain(
        name,
        {
          actions: { ...vocab.actions, ...(extension.actions ?? {}) } as any,
          queries: { ...vocab.queries, ...(extension.queries ?? {}) } as any,
          assertions: { ...vocab.assertions, ...(extension.assertions ?? {}) } as any,
        },
        domain,
      )
    },
  }
  return domain
}

export function defineDomain<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
>(config: DomainConfig<A, Q, S>): Domain<A, Q, S> {
  return makeDomain(config.name, {
    actions: config.actions,
    queries: config.queries,
    assertions: config.assertions,
  })
}
