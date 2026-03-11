import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export interface DomainConfig<
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
> {
  name: string
  actions: A
  queries?: Q
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
  extend(name: string, extension: {
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
    extend(childName, extension) {
      // Check for name collisions in actions
      const extActionKeys = Object.keys(extension.actions ?? {})
      const collisionActions = extActionKeys.filter(key => key in vocab.actions)
      if (collisionActions.length > 0) {
        throw new Error(
          `Domain extension collision: action(s) '${collisionActions.join("', '")}' already exist in parent domain '${name}'`
        )
      }

      // Check for name collisions in queries
      const extQueryKeys = Object.keys(extension.queries ?? {})
      const collisionQueries = extQueryKeys.filter(key => key in vocab.queries)
      if (collisionQueries.length > 0) {
        throw new Error(
          `Domain extension collision: query(s) '${collisionQueries.join("', '")}' already exist in parent domain '${name}'`
        )
      }

      // Check for name collisions in assertions
      const extAssertionKeys = Object.keys(extension.assertions ?? {})
      const collisionAssertions = extAssertionKeys.filter(key => key in vocab.assertions)
      if (collisionAssertions.length > 0) {
        throw new Error(
          `Domain extension collision: assertion(s) '${collisionAssertions.join("', '")}' already exist in parent domain '${name}'`
        )
      }

      return makeDomain(
        childName,
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
  Q extends Record<string, QueryMarker<any, any>> = Record<string, never>,
  S extends Record<string, AssertionMarker<any>> = Record<string, never>,
>(config: DomainConfig<A, Q, S>): Domain<A, Q, S> {
  return makeDomain(config.name, {
    actions: config.actions,
    queries: (config.queries ?? {}) as Q,
    assertions: config.assertions,
  })
}
