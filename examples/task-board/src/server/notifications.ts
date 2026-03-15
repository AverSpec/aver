import { context, trace, type Context } from '@opentelemetry/api'
import { tracer } from './tracing.js'

interface Notification {
  taskTitle: string
  assignee: string
  /** Captured OTel context from the enqueue site, used for span linking. */
  originContext: Context
}

const queue: Notification[] = []
let processing = false

export function enqueueNotification(taskTitle: string, assignee: string) {
  // Capture the active context so the worker span can link back to the
  // originating span (e.g. task.assign), preserving causal correlation
  // even though setTimeout breaks the automatic context chain.
  const originContext = context.active()
  queue.push({ taskTitle, assignee, originContext })
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

  // Create a span link back to the originating span so that Aver's
  // correlation verification can connect task.assign → notification.process
  // across the async boundary that setTimeout introduces.
  const originSpan = trace.getSpan(item.originContext)
  const links = originSpan
    ? [{ context: originSpan.spanContext() }]
    : []

  tracer.startActiveSpan('notification.process', { links }, (span) => {
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
