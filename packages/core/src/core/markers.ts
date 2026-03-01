import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

/**
 * Declares an action in a domain vocabulary.
 *
 * This is a type-level marker -- it defines the type contract for the action's
 * payload but does not create a runtime object. The actual implementation is
 * provided by adapters via `implement()`.
 */
export function action<P = void>(): ActionMarker<P> {
  return { kind: 'action' } as ActionMarker<P>
}

/**
 * Declares a query in a domain vocabulary.
 *
 * This is a type-level marker -- it defines the type contract for the query's
 * parameters and return type but does not create a runtime object. The actual
 * implementation is provided by adapters via `implement()`.
 */
export function query<R = unknown>(): QueryMarker<void, R>
export function query<P, R>(): QueryMarker<P, R>
export function query(): QueryMarker<any, any> {
  return { kind: 'query' } as QueryMarker<any, any>
}

/**
 * Declares an assertion in a domain vocabulary.
 *
 * This is a type-level marker -- it defines the type contract for the assertion's
 * payload but does not create a runtime object. The actual implementation is
 * provided by adapters via `implement()`.
 */
export function assertion<P = void>(): AssertionMarker<P> {
  return { kind: 'assertion' } as AssertionMarker<P>
}
