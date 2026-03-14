import { defineConfig } from '@averspec/core'
import { unitAdapter } from './adapters/task-board.unit.js'
import { httpAdapter } from './adapters/task-board.http.js'
import { playwrightAdapter } from './adapters/task-board.playwright.js'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter, playwrightAdapter],
})
