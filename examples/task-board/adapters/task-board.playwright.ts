import { implement } from 'aver'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'
import type { Browser, Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let browser: Browser | undefined
const consoleLogs = new WeakMap<Page, string[]>()
const artifactsDir = join(process.cwd(), 'test-results', 'aver-artifacts')

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
    const logs: string[] = []
    consoleLogs.set(page, logs)
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`)
    })
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
  async onTestFail(page: Page, meta: { testName: string; domainName?: string; protocolName?: string }) {
    const safeDomain = toSafeName(meta.domainName ?? 'domain')
    const safeProtocol = toSafeName(meta.protocolName ?? 'protocol')
    const safeTest = toSafeName(meta.testName)
    const testDir = join(artifactsDir, safeDomain, safeProtocol, safeTest)
    mkdirSync(testDir, { recursive: true })
    const attachments = []

    const screenshotPath = join(testDir, 'screenshot.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    attachments.push({ name: 'screenshot', path: screenshotPath, mime: 'image/png' })

    const htmlPath = join(testDir, 'page.html')
    const html = await page.content()
    writeFileSync(htmlPath, html, 'utf-8')
    attachments.push({ name: 'page-html', path: htmlPath, mime: 'text/html' })

    const logs = consoleLogs.get(page) ?? []
    if (logs.length > 0) {
      const logPath = join(testDir, 'console.log')
      writeFileSync(logPath, logs.join('\n') + '\n', 'utf-8')
      attachments.push({ name: 'console-log', path: logPath, mime: 'text/plain' })
    }

    return attachments
  },
}

function toSafeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'test'
}

export const playwrightAdapter = implement(taskBoard, {
  protocol: playwrightProtocol,

  actions: {
    deleteTask: async (page, { title }) => {
      await page.getByTestId(`task-${title}`).getByTestId('delete-btn').click()
      await page.getByTestId(`task-${title}`).waitFor({ state: 'detached' })
    },
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
