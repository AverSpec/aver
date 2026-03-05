import type { ActionMarker, QueryMarker, AssertionMarker, TelemetryDeclaration } from './types'

export interface MarkerOptions<P = void> {
  telemetry: TelemetryDeclaration<P>
}

/**
 * Declares an action in a domain vocabulary.
 *
 * Optionally accepts a `telemetry` expectation declaring the OTel span
 * the application should emit when this action is performed.
 */
export function action<P = void>(opts?: MarkerOptions<P>): ActionMarker<P> {
  return { kind: 'action', ...(opts?.telemetry && { telemetry: opts.telemetry }) } as ActionMarker<P>
}

/**
 * Declares a query in a domain vocabulary.
 *
 * Optionally accepts a `telemetry` expectation declaring the OTel span
 * the application should emit when this query is executed.
 */
export function query<R = unknown>(opts?: MarkerOptions<void>): QueryMarker<void, R>
export function query<P, R>(opts?: MarkerOptions<P>): QueryMarker<P, R>
export function query(opts?: MarkerOptions<any>): QueryMarker<any, any> {
  return { kind: 'query', ...(opts?.telemetry && { telemetry: opts.telemetry }) } as QueryMarker<any, any>
}

/**
 * Declares an assertion in a domain vocabulary.
 *
 * Optionally accepts a `telemetry` expectation declaring the OTel span
 * the application should emit when this assertion holds true.
 */
export function assertion<P = void>(opts?: MarkerOptions<P>): AssertionMarker<P> {
  return { kind: 'assertion', ...(opts?.telemetry && { telemetry: opts.telemetry }) } as AssertionMarker<P>
}
