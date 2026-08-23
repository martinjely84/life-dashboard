import { useState } from 'react'
import {
  useStore, domainsSorted, domainCounts, firstOpenGoal, addDomain,
} from '../lib/store'
import { DomainModal } from './Modal'
import Today from './Today'

function DomainCard({ def, onOpen }) {
  const s = useStore()
  const counts = domainCounts(s, def.id)
  const goal = firstOpenGoal(s, def.id)

  return (
    <div
      className="dcard"
      onClick={() => onOpen(def.id)}
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
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ onOpenDomain }) {
  const s = useStore()
  const [newDomain, setNewDomain] = useState(false)
  const defs = domainsSorted(s)

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
