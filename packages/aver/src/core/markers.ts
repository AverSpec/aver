import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export function action<P = void>(): ActionMarker<P> {
  return { kind: 'action' } as ActionMarker<P>
}

export function query<R = unknown>(): QueryMarker<R> {
  return { kind: 'query' } as QueryMarker<R>
}

export function assertion<P = void>(): AssertionMarker<P> {
  return { kind: 'assertion' } as AssertionMarker<P>
}
