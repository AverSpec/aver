import { useState, useEffect, useCallback } from 'react'

interface Task {
  id: string
  title: string
  status: string
  assignee?: string
}

const COLUMNS = ['backlog', 'in-progress', 'done']

export function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newStatus, setNewStatus] = useState('backlog')

  const refresh = useCallback(async () => {
    const all: Task[] = []
    for (const status of COLUMNS) {
      const res = await fetch(`/api/tasks?status=${encodeURIComponent(status)}`)
      const items = await res.json()
      all.push(...items)
    }
    setTasks(all)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, status: newStatus }),
    })
    setNewTitle('')
    setNewStatus('backlog')
    await refresh()
  }

  const handleMove = async (title: string, status: string) => {
    await fetch(`/api/tasks/${encodeURIComponent(title)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await refresh()
  }

  const handleAssign = async (title: string, assignee: string) => {
    await fetch(`/api/tasks/${encodeURIComponent(title)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee }),
    })
    await refresh()
  }

  return (
    <div className="board">
      <h1>Task Board</h1>

      <form onSubmit={handleCreate} className="create-form">
        <input
          data-testid="new-task-title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Task title"
        />
        <select
          data-testid="new-task-status"
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
        >
          {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button data-testid="create-task-btn" type="submit">Create</button>
      </form>

      <div className="columns">
        {COLUMNS.map(col => (
          <div key={col} className="column" data-testid={`column-${col}`}>
            <h2>{col}</h2>
            {tasks.filter(t => t.status === col).map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onMove={handleMove}
                onAssign={handleAssign}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onMove,
  onAssign,
}: {
  task: Task
  onMove: (title: string, status: string) => void
  onAssign: (title: string, assignee: string) => void
}) {
  const [assignInput, setAssignInput] = useState('')

  return (
    <div className="card" data-testid={`task-${task.title}`} data-status={task.status}>
      <div data-testid="task-title">{task.title}</div>
      {task.assignee && <div data-testid="task-assignee">{task.assignee}</div>}

      <div className="actions">
        {COLUMNS.filter(c => c !== task.status).map(c => (
          <button key={c} data-testid={`move-${c}`} onClick={() => onMove(task.title, c)}>
            → {c}
          </button>
        ))}
      </div>

      <div className="assign">
        <input
          data-testid="assign-input"
          value={assignInput}
          onChange={e => setAssignInput(e.target.value)}
          placeholder="Assignee"
          size={10}
        />
        <button
          data-testid="assign-btn"
          onClick={() => { onAssign(task.title, assignInput); setAssignInput('') }}
        >
          Assign
        </button>
      </div>
    </div>
  )
}
