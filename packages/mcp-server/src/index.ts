export {}

import { resolveConfigPath, loadConfig } from './config.js'
import { createServer, startServer } from './server.js'
import { registerTools } from './tools/index.js'

const configPath = resolveConfigPath(process.argv.slice(2))

if (configPath) {
  console.error(`aver: loading config from ${configPath}`)
  await loadConfig(configPath)
} else {
  console.error('aver: no config file found, starting with empty registry')
}

const server = createServer()
registerTools(server)
await startServer(server)
