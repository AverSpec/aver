import { log } from './logger.js'

/**
 * Security gate for dynamic imports of project code.
 *
 * When the MCP server is pointed at an untrusted project, `import()` on domain
 * files and config files is an arbitrary-code-execution vector.  This module
 * provides a simple opt-in gate: the environment variable `AVER_TRUST_PROJECT`
 * must be set to `1` before any project code is dynamically imported.
 *
 * If the variable is not set, the server starts normally but with no domains
 * loaded, and a clear warning is logged explaining what happened and how to
 * enable imports.
 */

const ENV_KEY = 'AVER_TRUST_PROJECT'

export function isProjectTrusted(): boolean {
  return process.env[ENV_KEY] === '1'
}

/**
 * Log a warning explaining that project imports were skipped and how to
 * enable them.  Call this once at startup when the gate blocks imports.
 */
export function logTrustWarning(context: 'config' | 'discovery', detail?: Record<string, unknown>): void {
  const messages: Record<string, string> = {
    config:
      `Skipping config file import — project code execution is not enabled. ` +
      `Set ${ENV_KEY}=1 to allow loading the aver config file.`,
    discovery:
      `Skipping domain auto-discovery — project code execution is not enabled. ` +
      `Set ${ENV_KEY}=1 to allow importing domain files from this project.`,
  }

  log('warn', messages[context], {
    envVar: ENV_KEY,
    howToEnable: `export ${ENV_KEY}=1`,
    ...detail,
  })
}
