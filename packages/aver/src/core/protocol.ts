/**
 * A protocol defines how to create and tear down a context
 * that adapter handlers receive as their first argument.
 */
export interface Protocol<Context> {
  readonly name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
}
