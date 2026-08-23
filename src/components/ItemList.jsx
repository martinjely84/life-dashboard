import { useState } from 'react'
import { ITEM_TYPES } from '../lib/seed'
import {
  useStore, actionsOf, addAction, addItem, deleteItem, toggleItem, updateItemText,
} from '../lib/store'

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

function ActionRow({ action }) {
  return (
    <div className="ai">
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
      <button className="adl" onClick={() => deleteItem(action.id)} aria-label="Delete action">✕</button>
    </div>
  )
}

function ItemRow({ item, accent }) {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const meta = ITEM_TYPES[item.type] || ITEM_TYPES.goal
  const isGoal = item.type === 'goal'
  const actions = isGoal ? actionsOf(s, item.id) : []
  const openActions = actions.filter((a) => !a.done).length

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    addAction(item.id, t)
    setDraft('')
  }

  return (
    <div className="gi-wrap">
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

        <button className="gdl" onClick={() => deleteItem(item.id)} aria-label="Delete item">✕</button>
      </div>

      {isGoal && open && (
        <div className="alist">
          {actions.map((a) => <ActionRow key={a.id} action={a} />)}
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

export default function ItemList({ items, folderId, accent = '#c8a96e', emptyText = 'Nothing here yet' }) {
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
          ? items.map((i) => <ItemRow key={i.id} item={i} accent={accent} />)
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
