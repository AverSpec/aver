import express from 'express'
import { Board } from './board.js'
import { createRouter } from './routes.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createServer(board?: Board) {
  const app = express()
  const b = board ?? new Board()

  app.use(express.json())
  app.use('/api', createRouter(b))

  // Serve built SPA in production / test
  const distPath = resolve(__dirname, '../../dist')
  if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('{*path}', (_req, res) => {
      res.sendFile(resolve(distPath, 'index.html'))
    })
  }

  return { app, board: b }
}

// Start server if run directly
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isDirectRun) {
  const { app } = createServer()
  const port = process.env.PORT ?? 3000
  app.listen(port, () => {
    console.log(`Task board server running on http://localhost:${port}`)
  })
}
