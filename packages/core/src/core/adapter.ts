import type { ActionMarker, QueryMarker, AssertionMarker } from './types'
import type { Domain } from './domain'
import type { Protocol } from './protocol'

type ActionHandler<Ctx, M> =
  M extends ActionMarker<infer P>
    ? P extends void
      ? (ctx: Ctx) => Promise<void>
      : (ctx: Ctx, payload: P) => Promise<void>
    : never

type QueryHandler<Ctx, M> =
  M extends QueryMarker<infer P, infer R>
    ? P extends void
      ? (ctx: Ctx) => Promise<R>
      : (ctx: Ctx, payload: P) => Promise<R>
    : never

type AssertionHandler<Ctx, M> =
  M extends AssertionMarker<infer P>
    ? P extends void
      ? (ctx: Ctx) => Promise<void>
      : (ctx: Ctx, payload: P) => Promise<void>
    : never

type ActionHandlers<Ctx, A extends Record<string, ActionMarker<any>>> = {
  [K in keyof A]: ActionHandler<Ctx, A[K]>
}

type QueryHandlers<Ctx, Q extends Record<string, QueryMarker<any, any>>> = {
  [K in keyof Q]: QueryHandler<Ctx, Q[K]>
}

type AssertionHandlers<Ctx, S extends Record<string, AssertionMarker<any>>> = {
  [K in keyof S]: AssertionHandler<Ctx, S[K]>
}

export interface AdapterConfig<
  Ctx,
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
> {
  protocol: Protocol<Ctx>
  actions: ActionHandlers<Ctx, A>
  queries: [keyof Q] extends [never] ? QueryHandlers<Ctx, Q> | undefined : QueryHandlers<Ctx, Q>
  assertions: AssertionHandlers<Ctx, S>
}

export interface Adapter<
  Ctx = any,
  A extends Record<string, ActionMarker<any>> = any,
  Q extends Record<string, QueryMarker<any, any>> = any,
  S extends Record<string, AssertionMarker<any>> = any,
> {
  readonly domain: Domain<A, Q, S>
  readonly protocol: Protocol<Ctx>
  readonly handlers: {
    readonly actions: ActionHandlers<Ctx, A>
    readonly queries: QueryHandlers<Ctx, Q>
    readonly assertions: AssertionHandlers<Ctx, S>
  }
}

export function implement<
  Ctx,
  A extends Record<string, ActionMarker<any>>,
  Q extends Record<string, QueryMarker<any, any>>,
  S extends Record<string, AssertionMarker<any>>,
>(
  domain: Domain<A, Q, S>,
  config: AdapterConfig<Ctx, A, Q, S>,
): Adapter<Ctx, A, Q, S> {
  return {
    domain,
    protocol: config.protocol,
    handlers: {
      actions: config.actions,
      queries: (config.queries ?? {}) as QueryHandlers<Ctx, Q>,
      assertions: config.assertions,
    },
  }
}
