export {}

import { resolveConfigPath, loadConfig, setProjectRoot } from './config.js'
import { discoverAndRegister } from './discovery.js'
import { createServer, startServer } from './server.js'
import { registerTools } from './tools/index.js'

const cwd = process.cwd()
const configPath = resolveConfigPath(process.argv.slice(2))

if (configPath) {
  console.error(`aver: loading config from ${configPath}`)
  setProjectRoot(cwd)
  try {
    await loadConfig(configPath)
  } catch (err) {
    console.error(`aver: config import failed, falling back to discovery: ${(err as Error).message}`)
    await discoverAndRegister(cwd)
  }
} else {
  console.error('aver: no config file found, using auto-discovery')
  setProjectRoot(cwd)
  await discoverAndRegister(cwd)
}

const server = createServer()
registerTools(server)
await startServer(server)
