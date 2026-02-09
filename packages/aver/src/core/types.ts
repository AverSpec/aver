/** Marker for an action declaration. P = payload type (void if no payload). */
export interface ActionMarker<P = void> {
  readonly kind: 'action'
  /** Phantom type — never exists at runtime. */
  readonly __payload?: P
}

/** Marker for a query declaration. R = return type. */
export interface QueryMarker<R = unknown> {
  readonly kind: 'query'
  readonly __return?: R
}

/** Marker for an assertion declaration. P = payload type (void if no payload). */
export interface AssertionMarker<P = void> {
  readonly kind: 'assertion'
  readonly __payload?: P
}

/** Any vocabulary marker. */
export type VocabMarker = ActionMarker<any> | QueryMarker<any> | AssertionMarker<any>

/** Extract payload type from an ActionMarker or AssertionMarker. */
export type PayloadOf<M> =
  M extends ActionMarker<infer P> ? P :
  M extends AssertionMarker<infer P> ? P :
  never

/** Extract return type from a QueryMarker. */
export type ReturnOf<M> =
  M extends QueryMarker<infer R> ? R :
  never
