/** Duck-typed asymmetric matcher (compatible with Jest/Vitest expect.any(), expect.stringMatching(), etc.). */
export interface AsymmetricMatcher {
  asymmetricMatch(value: unknown): boolean
}

/** Attribute value: exact primitive match, or a duck-typed matcher for pattern matching. */
export type TelemetryAttributeValue = string | number | boolean | AsymmetricMatcher

/** Expected OTel span pattern for telemetry verification. */
export interface TelemetryExpectation {
  /** OTel span name to match. */
  readonly span: string
  /** Required span attributes. Use primitives for exact match, or asymmetric matchers (e.g. expect.any(String)) for pattern match. */
  readonly attributes?: Readonly<Record<string, TelemetryAttributeValue>>
  /** Span names this operation causally triggers. Verifies trace connection (same trace or span link) to the named spans. */
  readonly causes?: readonly string[]
}

/** Static expectation or a function that derives the expectation from the operation's parameters. */
export type TelemetryDeclaration<P = void> =
  | TelemetryExpectation
  | (P extends void ? never : (params: P) => TelemetryExpectation)

/** Marker for an action declaration. P = payload type (void if no payload). */
export interface ActionMarker<P = void> {
  readonly kind: 'action'
  /** Phantom type — never exists at runtime. */
  readonly __payload?: P
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryDeclaration<P>
}

/** Marker for a query declaration. P = payload type (void if no payload), R = return type. */
export interface QueryMarker<P = void, R = unknown> {
  readonly kind: 'query'
  readonly __payload?: P
  readonly __return?: R
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryDeclaration<P>
}

/** Marker for an assertion declaration. P = payload type (void if no payload). "Assertion" spelling is intentional. */
export interface AssertionMarker<P = void> {
  readonly kind: 'assertion'
  readonly __payload?: P
  /** Expected OTel telemetry for this operation. */
  readonly telemetry?: TelemetryDeclaration<P>
}

/** Any vocabulary marker. */
export type VocabMarker = ActionMarker<any> | QueryMarker<any, any> | AssertionMarker<any>

