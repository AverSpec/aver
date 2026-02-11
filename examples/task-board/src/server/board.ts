export interface Task {
  id: string
  title: string
  status: string
  assignee?: string
}

export class Board {
  private tasks: Task[] = []
  private nextId = 1

  create(title: string, status = 'backlog'): Task {
    const task: Task = { id: String(this.nextId++), title, status }
    this.tasks.push(task)
    return task
  }

  move(title: string, status: string): Task {
    const task = this.tasks.find(t => t.title === title)
    if (!task) throw new Error(`Task "${title}" not found`)
    task.status = status
    return task
  }

  delete(title: string): void {
    const idx = this.tasks.findIndex(t => t.title === title)
    if (idx === -1) throw new Error(`Task "${title}" not found`)
    this.tasks.splice(idx, 1)
  }

  assign(title: string, assignee: string): Task {
    const task = this.tasks.find(t => t.title === title)
    if (!task) throw new Error(`Task "${title}" not found`)
    task.assignee = assignee
    return task
  }

  byStatus(status: string): Task[] {
    return this.tasks.filter(t => t.status === status)
  }

  details(title: string): Task | undefined {
    return this.tasks.find(t => t.title === title)
  }
}
