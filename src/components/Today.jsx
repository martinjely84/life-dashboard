import { useState } from 'react'
import {
  useStore, todosSorted, addTodo, toggleTodo, updateTodo, deleteTodo, clearDoneTodos,
  habitsSorted, habitDoneToday, addHabit, toggleHabit, updateHabit, deleteHabit,
} from '../lib/store'

function EditableText({ value, className, onCommit }) {
  const [draft, setDraft] = useState(null)
  return (
    <input
      className={className}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() && draft !== value) onCommit(draft.trim())
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
    />
  )
}

function AddRow({ placeholder, onAdd }) {
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText('')
  }
  return (
    <div className="gadd" style={{ marginTop: 8 }}>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button className="btn-g" onClick={submit}>Add</button>
    </div>
  )
}

function TodoList() {
  const s = useStore()
  const todos = todosSorted(s)
  const open = todos.filter((t) => !t.done).length
  const done = todos.length - open

  return (
    <div className="panel today-col">
      <div className="sl" style={{ marginBottom: '.75rem' }}>
        To-do <span className="pbadge">{open}</span>
        {done > 0 && (
          <button className="btn-newsf" style={{ marginLeft: 'auto' }} onClick={clearDoneTodos}>
            clear {done} done
          </button>
        )}
      </div>

      <div className="glist">
        {todos.length ? todos.map((t) => (
          <div className="gi-wrap" key={t.id}>
            <div className="gi">
              <button
                className="gck"
                style={t.done ? { background: '#c8a96e', borderColor: '#c8a96e', color: '#0d0f14' } : undefined}
                onClick={() => toggleTodo(t.id)}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done ? '✓' : ''}
              </button>
              <EditableText
                className={`gtx${t.done ? ' dn' : ''}`}
                value={t.text}
                onCommit={(v) => updateTodo(t.id, v)}
              />
              <button className="gdl" onClick={() => deleteTodo(t.id)} aria-label="Delete">✕</button>
            </div>
          </div>
        )) : <div className="empty">Nothing on the list</div>}
      </div>

      <AddRow placeholder="Add a to-do…" onAdd={addTodo} />
    </div>
  )
}

function HabitList() {
  const s = useStore()
  const habits = habitsSorted(s)
  const doneToday = habits.filter(habitDoneToday).length

  return (
    <div className="panel today-col">
      <div className="sl" style={{ marginBottom: '.75rem' }}>
        Daily habits <span className="pbadge">{doneToday}/{habits.length}</span>
      </div>

      <div className="glist">
        {habits.length ? habits.map((h) => {
          const done = habitDoneToday(h)
          return (
            <div className="gi-wrap" key={h.id}>
              <div className="gi">
                <button
                  className="gck"
                  style={done ? { background: '#4ecdc4', borderColor: '#4ecdc4', color: '#0d0f14' } : undefined}
                  onClick={() => toggleHabit(h.id)}
                  aria-label={done ? 'Not done today' : 'Done today'}
                >
                  {done ? '✓' : ''}
                </button>
                <EditableText
                  className={`gtx${done ? ' dn' : ''}`}
                  value={h.text}
                  onCommit={(v) => updateHabit(h.id, v)}
                />
                {h.streak > 0 && (
                  <span className="streak" title={`${h.streak} day streak`}>
                    🔥 {h.streak}
                  </span>
                )}
                <button className="gdl" onClick={() => deleteHabit(h.id)} aria-label="Delete">✕</button>
              </div>
            </div>
          )
        }) : <div className="empty">No habits yet</div>}
      </div>

      <AddRow placeholder="Add a daily habit…" onAdd={addHabit} />
    </div>
  )
}

export default function Today() {
  return (
    <div className="today-grid">
      <TodoList />
      <HabitList />
    </div>
  )
}
