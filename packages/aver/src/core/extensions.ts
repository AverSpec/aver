export interface Screenshotter {
  capture(outputPath: string, options?: { region?: string }): Promise<void>
  regions?: Record<string, string>
}

export interface ProtocolExtensions {
  screenshotter?: Screenshotter
  [key: string]: unknown
}
