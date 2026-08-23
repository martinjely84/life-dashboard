import { useEffect, useRef, useState } from 'react'
import { ITEM_TYPES } from '../lib/seed'
import { useStore, notesFor, addNote, updateNote, deleteNote } from '../lib/store'

// "3 hours ago" for recent entries, a real date once it stops being useful.
function when(iso) {
  const then = new Date(iso)
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const stamp = (iso) => new Date(iso).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

function Entry({ note }) {
  const [draft, setDraft] = useState(null)
  const editing = draft !== null

  const commit = () => {
    if (draft && draft.trim() && draft !== note.text) updateNote(note.id, draft.trim())
    setDraft(null)
  }

  return (
    <li className="tl-item">
      <span className="tl-dot" />
      <div className="tl-body">
        <div className="tl-meta">
          <span className="tl-when" title={stamp(note.created_at)}>{when(note.created_at)}</span>
          <button className="tl-del" onClick={() => deleteNote(note.id)} aria-label="Delete note">✕</button>
        </div>
        {editing ? (
          <textarea
            className="tl-edit"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDraft(null)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur()
            }}
          />
        ) : (
          <div className="tl-text" onClick={() => setDraft(note.text)} title="Click to edit">
            {note.text}
          </div>
        )}
      </div>
    </li>
  )
}

export default function NotePanel({ item, onClose }) {
  const s = useStore()
  const [text, setText] = useState('')
  const boxRef = useRef(null)
  const notes = notesFor(s, item.id)
  const meta = ITEM_TYPES[item.type] || ITEM_TYPES.goal

  useEffect(() => {
    boxRef.current?.focus()
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const post = () => {
    const t = text.trim()
    if (!t) return
    addNote(item.id, t)
    setText('')
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="note-panel">
        <button className="px" onClick={onClose} aria-label="Close">✕</button>

        <div className="ph" style={{ marginBottom: '.5rem' }}>
          <span className="badge" style={{ background: `${meta.color}22`, color: meta.color, marginTop: 0 }}>
            {meta.short}
          </span>
          <div className="ph-ti" style={{ fontSize: '1.25rem' }}>{item.text}</div>
        </div>

        <div className="sl" style={{ marginBottom: '.9rem' }}>
          Notes &amp; updates
          <span className="pbadge">{notes.length}</span>
        </div>

        <div className="tl-add">
          <textarea
            ref={boxRef}
            value={text}
            placeholder="What's happened? Add an update…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
            }}
          />
          <div className="tl-add-row">
            <span className="tl-hint">Ctrl + Enter to post</span>
            <button className="btn-g" onClick={post} disabled={!text.trim()}>Post update</button>
          </div>
        </div>

        {notes.length ? (
          <ul className="tl">
            {notes.map((n) => <Entry key={n.id} note={n} />)}
          </ul>
        ) : (
          <div className="empty">No updates yet — the newest will appear here first.</div>
        )}
      </div>
    </div>
  )
}
