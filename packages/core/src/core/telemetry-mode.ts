export type TelemetryVerificationMode = 'warn' | 'fail' | 'off'

export const VALID_TELEMETRY_MODES: readonly TelemetryVerificationMode[] = ['warn', 'fail', 'off']

export function parseTelemetryMode(value: string | undefined): TelemetryVerificationMode | undefined {
  if (value === undefined || value === '') return undefined
  if (VALID_TELEMETRY_MODES.includes(value as TelemetryVerificationMode)) {
    return value as TelemetryVerificationMode
  }
  throw new Error(
    `Invalid AVER_TELEMETRY_MODE: '${value}'. Valid values are: ${VALID_TELEMETRY_MODES.join(', ')}`
  )
}

export function resolveTelemetryMode(override?: TelemetryVerificationMode): TelemetryVerificationMode {
  if (override) return override
  const envMode = typeof process !== 'undefined' ? parseTelemetryMode(process.env.AVER_TELEMETRY_MODE) : undefined
  return envMode ?? (typeof process !== 'undefined' && process.env.CI ? 'fail' : 'warn')
}
