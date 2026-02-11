import { implement } from 'aver'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'
import type { Browser, Page } from 'playwright'

let browser: Browser | undefined

const playwrightProtocol = {
  name: 'playwright',
  async setup(): Promise<Page> {
    // Start Express server with fresh Board
    const { app } = createServer()
    const server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 3000
    const baseUrl = `http://localhost:${port}`

    // Launch browser once, reuse across tests
    if (!browser) {
      const pw = await import('playwright')
      browser = await pw.chromium.launch({ headless: true })
    }
    const page = await browser.newPage()
    // Stash server on page for teardown
    ;(page as any).__server = server
    await page.goto(baseUrl)
    return page
  },
  async teardown(page: Page) {
    const server = (page as any).__server as Server | undefined
    await page.close()
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
}

export const playwrightAdapter = implement(taskBoard, {
  protocol: playwrightProtocol,

  actions: {
    createTask: async (page, { title, status }) => {
      await page.getByTestId('new-task-title').fill(title)
      if (status && status !== 'backlog') {
        await page.getByTestId('new-task-status').selectOption(status)
      }
      await page.getByTestId('create-task-btn').click()
      await page.getByTestId(`task-${title}`).waitFor()
    },
    moveTask: async (page, { title, status }) => {
      await page.getByTestId(`task-${title}`).getByTestId(`move-${status}`).click()
      await page.getByTestId(`column-${status}`).getByTestId(`task-${title}`).waitFor()
    },
    assignTask: async (page, { title, assignee }) => {
      await page.getByTestId(`task-${title}`).getByTestId('assign-input').fill(assignee)
      await page.getByTestId(`task-${title}`).getByTestId('assign-btn').click()
      await page.getByTestId(`task-${title}`).getByText(assignee).waitFor()
    },
  },

  queries: {
    tasksByStatus: async (page, { status }) => {
      const column = page.getByTestId(`column-${status}`)
      const cards = column.getByTestId(/^task-/)
      const count = await cards.count()
      const tasks = []
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i)
        const taskTitle = await card.getByTestId('card-title').textContent() ?? ''
        const assigneeEl = card.getByTestId('card-assignee')
        const assignee = (await assigneeEl.count()) > 0 ? await assigneeEl.textContent() : undefined
        tasks.push({ title: taskTitle.trim(), status, assignee: assignee?.trim() || undefined })
      }
      return tasks
    },
    taskDetails: async (page, { title }) => {
      const card = page.getByTestId(`task-${title}`)
      if ((await card.count()) === 0) return undefined
      const status = await card.getAttribute('data-status') ?? ''
      const assigneeEl = card.getByTestId('card-assignee')
      const assignee = (await assigneeEl.count()) > 0 ? await assigneeEl.textContent() : undefined
      return { title, status, assignee: assignee?.trim() || undefined }
    },
  },

  assertions: {
    taskInStatus: async (page, { title, status }) => {
      const card = page.getByTestId(`column-${status}`).getByTestId(`task-${title}`)
      const count = await card.count()
      if (count === 0) {
        throw new Error(`Expected task "${title}" in column "${status}" but not found`)
      }
    },
    taskAssignedTo: async (page, { title, assignee }) => {
      const text = await page.getByTestId(`task-${title}`).getByTestId('card-assignee').textContent()
      if (text?.trim() !== assignee) {
        throw new Error(`Expected task "${title}" assigned to "${assignee}" but was "${text?.trim()}"`)
      }
    },
    taskCount: async (page, { status, count }) => {
      const column = page.getByTestId(`column-${status}`)
      const cards = column.getByTestId(/^task-/)
      const actual = await cards.count()
      if (actual !== count) {
        throw new Error(`Expected ${count} tasks in "${status}" but found ${actual}`)
      }
    },
  },
})
