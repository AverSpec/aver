import { tracer } from './tracing.js'

interface Notification {
  taskTitle: string
  assignee: string
}

const queue: Notification[] = []
let processing = false

export function enqueueNotification(taskTitle: string, assignee: string) {
  queue.push({ taskTitle, assignee })
  if (!processing) {
    processing = true
    setTimeout(processNext, 10)
  }
}

function processNext() {
  const item = queue.shift()
  if (!item) {
    processing = false
    return
  }

  tracer.startActiveSpan('notification.process', (span) => {
    span.setAttribute('task.title', item.taskTitle)
    span.setAttribute('notification.assignee', item.assignee)

    tracer.startActiveSpan('notification.send', (sendSpan) => {
      sendSpan.setAttribute('notification.channel', 'email')
      sendSpan.end()
    })

    span.end()
  })

  setTimeout(processNext, 10)
}

export function drainQueue(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (queue.length === 0 && !processing) resolve()
      else setTimeout(check, 20)
    }
    check()
  })
}
