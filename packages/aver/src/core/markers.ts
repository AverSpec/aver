import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export function action<P = void>(): ActionMarker<P> {
  return { kind: 'action' } as ActionMarker<P>
}

export function query<P = void, R = unknown>(): QueryMarker<P, R> {
  return { kind: 'query' } as QueryMarker<P, R>
}

export function assertion<P = void>(): AssertionMarker<P> {
  return { kind: 'assertion' } as AssertionMarker<P>
}
