/** A binding for a span attribute — either a literal value or a correlation symbol. */
export type AttributeBinding =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'correlated'; symbol: string }

/** Expected span in the behavioral contract. */
export interface SpanExpectation {
  /** OTel span name. */
  readonly name: string
  /** Attribute bindings — literal values or correlation symbols. */
  readonly attributes: Record<string, AttributeBinding>
  /** When present, the matched production span's parent must have this name. */
  readonly parentName?: string
}

/** A single contract entry — one test example's expected trace pattern. */
export interface ContractEntry {
  /** Test name that produced this entry. */
  readonly testName: string
  /** Ordered span expectations (Given/When/Then sequence). */
  readonly spans: readonly SpanExpectation[]
}

/** The full behavioral contract exported from test runs. */
export interface BehavioralContract {
  /** Domain name. */
  readonly domain: string
  /** Contract entries — one per passing test example. */
  readonly entries: readonly ContractEntry[]
}
