import { useState } from 'react'
import {
  useStore, domainsSorted, domainCounts, firstOpenGoal, addDomain,
  reorderDomain, moveDomain,
} from '../lib/store'
import { DomainModal } from './Modal'
import Today from './Today'

function DomainCard({ def, index, count, onOpen, dragging, setDragging }) {
  const s = useStore()
  const [over, setOver] = useState(false)
  const counts = domainCounts(s, def.id)
  const goal = firstOpenGoal(s, def.id)

  // The arrows stop propagation so nudging a tile never opens the domain.
  const nudge = (e, delta) => {
    e.stopPropagation()
    moveDomain(def.id, delta)
  }

  return (
    <div
      className={`dcard${over ? ' dragover' : ''}${dragging === def.id ? ' dragging' : ''}`}
      onClick={() => onOpen(def.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(def.id) }}
      draggable
      onDragStart={(e) => {
        setDragging(def.id)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/domain-id', def.id)
      }}
      onDragEnd={() => { setDragging(null); setOver(false) }}
      onDragOver={(e) => {
        if (!dragging || dragging === def.id) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/domain-id')
        if (id && id !== def.id) reorderDomain(id, index)
        setDragging(null)
      }}
    >
      <div className="dc-top">
        <span className="dc-em">{def.emoji}</span>
        <span className="dc-nm">{def.name}</span>
        <span className="dc-sc" style={{ background: `${def.color}22`, color: def.color }}>{def.score}</span>
      </div>

      <div className="dc-move">
        <button className="dc-arrow" disabled={index === 0}
          onClick={(e) => nudge(e, -1)} aria-label="Move left">‹</button>
        <button className="dc-arrow" disabled={index === count - 1}
          onClick={(e) => nudge(e, 1)} aria-label="Move right">›</button>
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
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ onOpenDomain }) {
  const s = useStore()
  const [newDomain, setNewDomain] = useState(false)
  const [dragging, setDragging] = useState(null)
  const defs = domainsSorted(s)

  return (
    <>
      <div className="sl">
        Life domains — click to open, drag or use ‹ › to reorder&nbsp;
        <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--dim)', letterSpacing: '.05em' }}>
          score out of 10
        </span>
      </div>

      <div className="dgrid">
        {defs.map((d, i) => (
          <DomainCard
            key={d.id}
            def={d}
            index={i}
            count={defs.length}
            onOpen={onOpenDomain}
            dragging={dragging}
            setDragging={setDragging}
          />
        ))}
        <button className="dcard dnew" onClick={() => setNewDomain(true)}>
          ＋ New domain
        </button>
      </div>

      <Today />

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
