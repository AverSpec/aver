import { implement, withFixture } from '@averspec/core'
import { playwright } from '@averspec/protocol-playwright'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'
import { expect } from '@playwright/test'

let server: Server | undefined
let baseUrl: string | undefined

const proto = playwright({
  captureHtml: true,
  regions: {
    'board': '.board',
    'backlog': '[data-testid="column-backlog"]',
  },
})

// Use withFixture to manage server lifecycle + navigate after each setup
const protocolWithServer = withFixture(proto, {
  async before() {
    const { app } = createServer()
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 3000
    baseUrl = `http://localhost:${port}`
  },
  async afterSetup(page) {
    await page.goto(baseUrl!)
    await page.waitForLoadState('domcontentloaded')
  },
  async after() {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
      baseUrl = undefined
    }
  },
})

export const playwrightAdapter = implement(taskBoard, {
  protocol: protocolWithServer,

  actions: {
    deleteTask: async (page, { title }) => {
      await page.getByTestId(`task-${title}`).getByTestId('delete-btn').click()
      await page.getByTestId(`task-${title}`).waitFor({ state: 'detached' })
    },
    createTask: async (page, { title, status }) => {
      await page.waitForSelector('[data-testid="new-task-title"]')
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
      await expect(card).toBeVisible()
    },
    taskAssignedTo: async (page, { title, assignee }) => {
      const assigneeEl = page.getByTestId(`task-${title}`).getByTestId('card-assignee')
      await expect(assigneeEl).toHaveText(assignee)
    },
    taskCount: async (page, { status, count }) => {
      const column = page.getByTestId(`column-${status}`)
      const cards = column.getByTestId(/^task-/)
      await expect(cards).toHaveCount(count)
    },
  },
})
