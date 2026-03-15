import { Router } from 'express'
import { Board } from './board.js'
import { tracer } from './tracing.js'
import { enqueueNotification } from './notifications.js'

export function createRouter(board: Board): Router {
  const router = Router()

  router.post('/tasks', (req, res) => {
    const { title, status } = req.body
    tracer.startActiveSpan('task.create', (span) => {
      span.setAttribute('task.title', title)
      const task = board.create(title, status)
      span.end()
      res.status(201).json(task)
    })
  })

  router.patch('/tasks/:title', (req, res) => {
    const { title } = req.params
    const { status, assignee } = req.body
    try {
      let task
      if (status !== undefined) {
        tracer.startActiveSpan('task.move', (span) => {
          span.setAttribute('task.title', title)
          task = board.move(title, status)
          span.end()
        })
      }
      if (assignee !== undefined) {
        tracer.startActiveSpan('task.assign', (span) => {
          span.setAttribute('task.title', title)
          task = board.assign(title, assignee)
          enqueueNotification(title, assignee)
          span.end()
        })
      }
      res.json(task)
    } catch (e: any) {
      res.status(404).json({ error: e.message })
    }
  })

  router.delete('/tasks/:title', (req, res) => {
    const { title } = req.params
    try {
      board.delete(title)
      res.status(204).end()
    } catch (e: any) {
      res.status(404).json({ error: e.message })
    }
  })

  router.get('/tasks', (req, res) => {
    const status = req.query.status as string
    res.json(board.byStatus(status))
  })

  router.get('/tasks/:title', (req, res) => {
    const task = board.details(req.params.title)
    if (!task) return res.status(404).json({ error: 'Not found' })
    res.json(task)
  })

  return router
}
