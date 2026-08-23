import { useEffect, useRef, useState } from 'react'

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="mov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

// Single-field prompt — used for "new folder" and "rename folder".
export function PromptModal({ title, label, placeholder, initial = '', confirm = 'Create', onSubmit, onClose }) {
  const [value, setValue] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label>{label}</label>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="mbtns">
        <button className="btn-s" onClick={onClose}>Cancel</button>
        <button className="btn-p" onClick={submit}>{confirm}</button>
      </div>
    </Modal>
  )
}

// "Are you sure?" — used for anything that destroys data.
export function ConfirmModal({ title, body, detail, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 13, marginBottom: detail ? '.75rem' : '1.25rem' }}>{body}</p>
      {detail && (
        <p style={{
          fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--red)',
          background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.3)',
          borderRadius: 8, padding: '.6rem .8rem', marginBottom: '1.25rem',
        }}>
          {detail}
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--mut)', marginBottom: '1rem' }}>
        This cannot be undone.
      </p>
      <div className="mbtns">
        <button className="btn-s" onClick={onClose}>Cancel</button>
        <button className="btn-d" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

const SWATCHES = [
  '#4ecdc4', '#c8a96e', '#7ec887', '#b088f9', '#f09ab5',
  '#ff6b6b', '#6ba3ff', '#e8a87c', '#ffd166', '#9ee493',
]

// Create or edit a domain: name, emoji and accent colour.
export function DomainModal({ initial, title, confirm = 'Create', onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name || '')
  const [emoji, setEmoji] = useState(initial?.emoji || '\u{1F4C1}')
  const [color, setColor] = useState(initial?.color || SWATCHES[0])
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = () => {
    if (!name.trim()) return
    onSubmit({ name: name.trim(), emoji: emoji.trim() || '\u{1F4C1}', color })
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label>Name</label>
      <input ref={ref} value={name} placeholder="e.g. Faith, Travel, Side projects…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()} />

      <label>Emoji</label>
      <input value={emoji} maxLength={4} style={{ width: 90, fontSize: 20, textAlign: 'center' }}
        onChange={(e) => setEmoji(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()} />

      <label>Colour</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`Colour ${c}`}
            style={{
              width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--txt)' : '2px solid transparent',
              outline: color === c ? '1px solid var(--txt)' : 'none', outlineOffset: 2,
            }}
          />
        ))}
      </div>

      <div className="mbtns">
        <button className="btn-s" onClick={onClose}>Cancel</button>
        <button className="btn-p" onClick={submit}>{confirm}</button>
      </div>
    </Modal>
  )
}

// Add-a-chat form for the Pending inbox.
export function ChatModal({ onSubmit, onClose }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  const submit = () => {
    if (!title.trim()) return
    onSubmit({ title: title.trim(), url: url.trim(), meta: meta.trim() })
    onClose()
  }

  return (
    <Modal title="Add a chat to inbox" onClose={onClose}>
      <label>Title</label>
      <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Planning notes for next month…"
        onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <label>Claude URL (optional)</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://claude.ai/chat/…" />
      <label>Short description (optional)</label>
      <input value={meta} onChange={(e) => setMeta(e.target.value)}
        placeholder="e.g. short description of the chat"
        onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <div className="mbtns">
        <button className="btn-s" onClick={onClose}>Cancel</button>
        <button className="btn-p" onClick={submit}>Add to inbox</button>
      </div>
    </Modal>
  )
}
