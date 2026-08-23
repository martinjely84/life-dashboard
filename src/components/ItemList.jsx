import { useEffect, useRef, useState } from 'react'
import { ITEM_TYPES, CHILD_TYPES } from '../lib/seed'
import {
  useStore, actionsOf, addAction, addItem, deleteItem, toggleItem, updateItemText,
  addTodo, addHabit, CADENCES, noteCount,
} from '../lib/store'
import NotePanel from './NotePanel'

// Copies an item's text onto the dashboard to-do list. Briefly confirms,
// because otherwise nothing visible happens on this screen.
function SendToTodo({ text }) {
  const [sent, setSent] = useState(false)
  return (
    <button
      className="gdl to-todo"
      title="Add to to-do list"
      onClick={() => { addTodo(text); setSent(true); setTimeout(() => setSent(false), 1600) }}
    >
      {sent ? '✓ added' : '＋ to-do'}
    </button>
  )
}

// Same idea as the to-do button, but a habit needs a cadence, so the button
// opens into the three choices rather than guessing one.
function SendToHabit({ text }) {
  const [picking, setPicking] = useState(false)
  const [sent, setSent] = useState(false)

  if (sent) return <span className="gdl to-todo sent">✓ habit</span>

  if (picking) {
    return (
      <span className="habit-pick">
        {Object.entries(CADENCES).map(([key, c]) => (
          <button
            key={key}
            className="gdl to-todo"
            title={`Add as a ${c.label.toLowerCase()} habit`}
            onClick={() => {
              addHabit(text, key)
              setPicking(false)
              setSent(true)
              setTimeout(() => setSent(false), 1600)
            }}
          >
            {c.label}
          </button>
        ))}
        <button className="gdl" onClick={() => setPicking(false)} aria-label="Cancel">✕</button>
      </span>
    )
  }

  return (
    <button className="gdl to-todo" title="Add to habits" onClick={() => setPicking(true)}>
      ＋ habit
    </button>
  )
}

// Opens the update timeline. Double-clicking the row does the same, but a
// visible button means you can find it, and it shows the count at a glance.
function NotesButton({ item, onOpen }) {
  const s = useStore()
  const n = noteCount(s, item.id)
  return (
    <button
      className={`gdl to-todo${n ? ' has-notes' : ''}`}
      title={n ? `${n} update${n === 1 ? '' : 's'}` : 'Add notes and updates'}
      onClick={onOpen}
    >
      ✎ {n || 'notes'}
    </button>
  )
}

function EditableText({ value, className, onCommit }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? value
  return (
    <input
      className={className}
      value={shown}
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

function ChildRow({ action, focused }) {
  const meta = ITEM_TYPES[action.type] || ITEM_TYPES.action
  const [notesOpen, setNotesOpen] = useState(false)
  return (
    <div
      className={`ai${focused ? ' focus' : ''}`}
      onDoubleClick={(e) => { if (e.target.tagName !== 'INPUT') setNotesOpen(true) }}
    >
      <button
        className="ack"
        style={action.done ? { background: meta.color, borderColor: meta.color, color: '#0d0f14' } : undefined}
        onClick={() => toggleItem(action.id)}
        aria-label={action.done ? 'Mark not done' : 'Mark done'}
      >
        {action.done ? '✓' : ''}
      </button>
      <span className="badge sm" style={{ background: `${meta.color}22`, color: meta.color }}>
        {meta.short}
      </span>
      <EditableText
        className={`atx${action.done ? ' dn' : ''}`}
        value={action.text}
        onCommit={(t) => updateItemText(action.id, t)}
      />
      <NotesButton item={action} onOpen={() => setNotesOpen(true)} />
      <SendToTodo text={action.text} />
      <SendToHabit text={action.text} />
      <button className="adl" onClick={() => deleteItem(action.id)} aria-label="Delete action">✕</button>
      {notesOpen && <NotePanel item={action} onClose={() => setNotesOpen(false)} />}
    </div>
  )
}

function ItemRow({ item, accent, focusItemId }) {
  const s = useStore()
  const meta = ITEM_TYPES[item.type] || ITEM_TYPES.goal
  const isGoal = item.type === 'goal'
  const actions = isGoal ? actionsOf(s, item.id) : []
  const openActions = actions.filter((a) => !a.done).length

  // Arriving from the Lists view: if the thing clicked was an action, open
  // its parent goal so it is actually visible.
  const hitsAction = actions.some((a) => a.id === focusItemId)
  const focused = item.id === focusItemId || hitsAction

  const [open, setOpen] = useState(hitsAction)
  const [draft, setDraft] = useState('')
  const [childType, setChildType] = useState('action')
  const [notesOpen, setNotesOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!focused) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    addAction(item.id, t, childType)
    setDraft('')
  }

  return (
    <div className={`gi-wrap${focused ? ' focus' : ''}`} ref={ref}>
      <div
        className="gi"
        onDoubleClick={(e) => { if (e.target.tagName !== 'INPUT') setNotesOpen(true) }}
      >
        <button
          className="gck"
          style={item.done ? { background: accent, borderColor: accent, color: '#0d0f14' } : undefined}
          onClick={() => toggleItem(item.id)}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
        >
          {item.done ? '✓' : ''}
        </button>

        <span className="badge" style={{ background: `${meta.color}22`, color: meta.color }}>
          {meta.short}
        </span>

        <EditableText
          className={`gtx${item.done ? ' dn' : ''}`}
          value={item.text}
          onCommit={(t) => updateItemText(item.id, t)}
        />

        {isGoal && (
          <button className="g-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'}
            <span className="a-count">{actions.length ? `${openActions}/${actions.length}` : '+'}</span>
          </button>
        )}

        <NotesButton item={item} onOpen={() => setNotesOpen(true)} />
        <SendToTodo text={item.text} />
        <SendToHabit text={item.text} />
        <button className="gdl" onClick={() => deleteItem(item.id)} aria-label="Delete item">✕</button>
      </div>

      {notesOpen && <NotePanel item={item} onClose={() => setNotesOpen(false)} />}

      {isGoal && open && (
        <div className="alist">
          {actions.map((a) => (
            <ChildRow key={a.id} action={a} focused={a.id === focusItemId} />
          ))}
          {!actions.length && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0' }}>
              Nothing under this goal yet
            </div>
          )}
          <div className="aadd">
            <select value={childType} onChange={(e) => setChildType(e.target.value)}
              aria-label="Type">
              {CHILD_TYPES.map((k) => (
                <option key={k} value={k}>{ITEM_TYPES[k].label}</option>
              ))}
            </select>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={`Add ${childType === 'action' ? 'an action' : `a ${ITEM_TYPES[childType].label.toLowerCase()}`}…`}
            />
            <button className="btn-a" onClick={submit}>Add</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ItemList({
  items, folderId, accent = '#c8a96e', focusItemId = null, emptyText = 'Nothing here yet',
}) {
  const [text, setText] = useState('')

  // Only goals live at folder level now; everything else hangs off a goal.
  const submit = () => {
    const t = text.trim()
    if (!t || !folderId) return
    addItem(folderId, 'goal', t)
    setText('')
  }

  return (
    <>
      <div className="glist">
        {items.length
          ? items.map((i) => (
            <ItemRow key={i.id} item={i} accent={accent} focusItemId={focusItemId} />
          ))
          : <div className="empty">{emptyText}</div>}
      </div>

      {folderId && (
        <div className="gadd">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Add a goal…"
          />
          <button className="btn-g" onClick={submit}>Add goal</button>
        </div>
      )}
    </>
  )
}
