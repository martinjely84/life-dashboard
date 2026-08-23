import { useState } from 'react'
import {
  useStore, domainsSorted, domainCounts, firstOpenGoal,
  pendingChats, addChat, deleteChat, moveChat,
} from '../lib/store'
import { ChatModal, DomainModal } from './Modal'
import { addDomain } from '../lib/store'

function DomainCard({ def, onOpen }) {
  const s = useStore()
  const [over, setOver] = useState(false)
  const counts = domainCounts(s, def.id)
  const goal = firstOpenGoal(s, def.id)

  return (
    <div
      className={`dcard${over ? ' dragover' : ''}`}
      onClick={() => onOpen(def.id)}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/chat-id')
        if (id) moveChat(id, { domainId: def.id })
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(def.id) }}
    >
      <div className="dc-top">
        <span className="dc-em">{def.emoji}</span>
        <span className="dc-nm">{def.name}</span>
        <span className="dc-sc" style={{ background: `${def.color}22`, color: def.color }}>{def.score}</span>
      </div>
      <div className="dc-bar-wrap">
        <div className="dc-bar-track">
          <div className="dc-bar-fill" style={{ width: `${(def.score / 10) * 100}%`, background: def.color }} />
        </div>
      </div>
      <div className="dc-bot">
        <div className="dc-gl">{goal || '—'}</div>
        <div className="dc-pills">
          <span className="dc-pill">{counts.goals} open</span>
          <span className="dc-pill">{counts.actions} actions</span>
          <span className="dc-pill">{counts.chats} chats</span>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ onOpenDomain }) {
  const s = useStore()
  const [adding, setAdding] = useState(false)
  const [newDomain, setNewDomain] = useState(false)
  const defs = domainsSorted(s)
  const pending = pendingChats(s)

  return (
    <>
      <div className="sl">
        Life domains — click to open&nbsp;
        <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--dim)', letterSpacing: '.05em' }}>
          score out of 10
        </span>
      </div>

      <div className="dgrid">
        {defs.map((d) => <DomainCard key={d.id} def={d} onOpen={onOpenDomain} />)}
        <button className="dcard dnew" onClick={() => setNewDomain(true)}>
          ＋ New domain
        </button>
      </div>

      <div className="phdr">
        <div className="sl" style={{ flex: 1, marginBottom: 0 }}>
          Pending inbox <span className="pbadge">{pending.length}</span>
        </div>
        <button className="btn-add" onClick={() => setAdding(true)}>＋ Add chat</button>
      </div>

      <div className="pgrid">
        {pending.length ? pending.map((c) => (
          <div
            className="pcard"
            key={c.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/chat-id', c.id)}
          >
            <div className="pt">
              <div className="ptitle">{c.title}</div>
              <button className="pdel" onClick={() => deleteChat(c.id)} aria-label="Delete">✕</button>
            </div>
            {c.url && (
              <div className="purl">
                <a href={c.url} target="_blank" rel="noreferrer">open chat ↗</a>
              </div>
            )}
            {c.meta && <div className="pmeta">{c.meta}</div>}
            <div className="phint">drag onto a domain →</div>
          </div>
        )) : (
          <div className="pempty">
            No pending chats — hit ＋ Add chat above, then drag cards into a domain.
          </div>
        )}
      </div>

      {adding && (
        <ChatModal onClose={() => setAdding(false)} onSubmit={(c) => addChat(c)} />
      )}

      {newDomain && (
        <DomainModal
          title="New domain"
          confirm="Create domain"
          onClose={() => setNewDomain(false)}
          onSubmit={(d) => addDomain(d)}
        />
      )}
    </>
  )
}
