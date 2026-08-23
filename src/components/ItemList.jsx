import { useEffect, useRef, useState } from 'react'
import { ITEM_TYPES } from '../lib/seed'
import {
  useStore, actionsOf, addAction, addItem, deleteItem, toggleItem, updateItemText,
  addTodo, addHabit, CADENCES,
} from '../lib/store'

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

function ActionRow({ action, focused }) {
  return (
    <div className={`ai${focused ? ' focus' : ''}`}>
      <button
        className="ack"
        style={action.done ? { background: '#4ecdc4', borderColor: '#4ecdc4', color: '#0d0f14' } : undefined}
        onClick={() => toggleItem(action.id)}
        aria-label={action.done ? 'Mark not done' : 'Mark done'}
      >
        {action.done ? '✓' : ''}
      </button>
      <EditableText
        className={`atx${action.done ? ' dn' : ''}`}
        value={action.text}
        onCommit={(t) => updateItemText(action.id, t)}
      />
      <SendToTodo text={action.text} />
      <SendToHabit text={action.text} />
      <button className="adl" onClick={() => deleteItem(action.id)} aria-label="Delete action">✕</button>
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
  const ref = useRef(null)

  useEffect(() => {
    if (!focused) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    addAction(item.id, t)
    setDraft('')
  }

  return (
    <div className={`gi-wrap${focused ? ' focus' : ''}`} ref={ref}>
      <div className="gi">
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

        <SendToTodo text={item.text} />
        <SendToHabit text={item.text} />
        <button className="gdl" onClick={() => deleteItem(item.id)} aria-label="Delete item">✕</button>
      </div>

      {isGoal && open && (
        <div className="alist">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} focused={a.id === focusItemId} />
          ))}
          {!actions.length && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0' }}>
              No actions yet
            </div>
          )}
          <div className="aadd">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Add an action…"
            />
            <button className="btn-a" onClick={submit}>Add action</button>
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
  const [type, setType] = useState('goal')

  const submit = () => {
    const t = text.trim()
    if (!t || !folderId) return
    addItem(folderId, type, t)
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
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Item type">
            {Object.entries(ITEM_TYPES)
              .filter(([k]) => k !== 'action')
              .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={`Add a ${ITEM_TYPES[type].label.toLowerCase()}…`}
          />
          <button className="btn-g" onClick={submit}>Add</button>
        </div>
      )}
    </>
  )
}
