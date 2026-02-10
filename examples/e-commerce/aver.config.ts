import { defineConfig } from 'aver'
import { directAdapter } from './adapters/task-board.direct.js'
import { httpAdapter } from './adapters/task-board.http.js'
import { playwrightAdapter } from './adapters/task-board.playwright.js'

export default defineConfig({
  adapters: [directAdapter, httpAdapter, playwrightAdapter],
})
