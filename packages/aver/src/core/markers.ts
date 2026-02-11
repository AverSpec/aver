import type { ActionMarker, QueryMarker, AssertionMarker } from './types'

export function action<P = void>(): ActionMarker<P> {
  return { kind: 'action' } as ActionMarker<P>
}

export function query<R = unknown>(): QueryMarker<void, R>
export function query<P, R>(): QueryMarker<P, R>
export function query(): QueryMarker<any, any> {
  return { kind: 'query' } as QueryMarker<any, any>
}

export function assertion<P = void>(): AssertionMarker<P> {
  return { kind: 'assertion' } as AssertionMarker<P>
}
