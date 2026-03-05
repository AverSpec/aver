/** Expected OTel span pattern for telemetry verification. */
export interface TelemetryExpectation {
  /** OTel span name to match. */
  readonly span: string
  /** Required span attributes (use dot-delimited OTel semantic convention keys). */
  readonly attributes?: Readonly<Record<string, string | number | boolean>>
}

/** Marker for an action declaration. P = payload type (void if no payload). */
export interface ActionMarker<P = void> {
  readonly kind: 'action'
  /** Phantom type — never exists at runtime. */
  readonly __payload?: P
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryExpectation
}

/** Marker for a query declaration. P = payload type (void if no payload), R = return type. */
export interface QueryMarker<P = void, R = unknown> {
  readonly kind: 'query'
  readonly __payload?: P
  readonly __return?: R
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryExpectation
}

/** Marker for an assertion declaration. P = payload type (void if no payload). */
export interface AssertionMarker<P = void> {
  readonly kind: 'assertion'
  readonly __payload?: P
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryExpectation
}

/** Any vocabulary marker. */
export type VocabMarker = ActionMarker<any> | QueryMarker<any, any> | AssertionMarker<any>

/** Extract payload type from an ActionMarker or AssertionMarker. */
export type PayloadOf<M> =
  M extends ActionMarker<infer P> ? P :
  M extends AssertionMarker<infer P> ? P :
  never

/** Extract return type from a QueryMarker. */
export type ReturnOf<M> =
  M extends QueryMarker<any, infer R> ? R :
  never
