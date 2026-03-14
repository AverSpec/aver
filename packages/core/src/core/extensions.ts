export interface Screenshotter {
  capture(outputPath: string, options?: { region?: string }): Promise<void>
  regions?: Record<string, string>
}

/**
 * Protocol extensions interface. Protocol packages can augment this
 * interface to declare their own extensions:
 *
 * ```ts
 * declare module '@averspec/core' {
 *   interface ProtocolExtensions {
 *     myExtension?: MyExtensionType
 *   }
 * }
 * ```
 */
export interface ProtocolExtensions {
  screenshotter?: Screenshotter
}
