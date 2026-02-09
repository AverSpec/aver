import { Router } from 'express'
import { Board } from './board.js'

export function createRouter(board: Board): Router {
  const router = Router()

  router.post('/tasks', (req, res) => {
    const { title, status } = req.body
    const task = board.create(title, status)
    res.status(201).json(task)
  })

  router.patch('/tasks/:title', (req, res) => {
    const { title } = req.params
    const { status, assignee } = req.body
    try {
      let task
      if (status !== undefined) task = board.move(title, status)
      if (assignee !== undefined) task = board.assign(title, assignee)
      res.json(task)
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
