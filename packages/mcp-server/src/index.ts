export {}

import { resolveConfigPath, loadConfig, setProjectRoot } from './config.js'
import { discoverAndRegister } from './discovery.js'
import { log } from './logger.js'
import { createServer, startServer } from './server.js'
import { registerTools } from './tools/index.js'

const cwd = process.cwd()
const configPath = resolveConfigPath(process.argv.slice(2))

if (configPath) {
  log('info', 'loading config', { configPath })
  setProjectRoot(cwd)
  try {
    await loadConfig(configPath)
  } catch (err) {
    log('warn', 'config import failed, falling back to discovery', { error: (err as Error).message })
    await discoverAndRegister(cwd)
  }
} else {
  log('info', 'no config file found, using auto-discovery')
  setProjectRoot(cwd)
  await discoverAndRegister(cwd)
}

const server = createServer()
registerTools(server)
await startServer(server)
