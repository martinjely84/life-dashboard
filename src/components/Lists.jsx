import { useMemo, useState } from 'react'
import { ITEM_TYPES } from '../lib/seed'
import { useStore, allItems, toggleItem, domainsSorted } from '../lib/store'

const TABS = [
  { key: 'goal',          label: 'All Goals' },
  { key: 'action',        label: 'All Actions' },
  { key: 'task',          label: 'All Tasks' },
  { key: 'research',      label: 'All To Research' },
  { key: '',              label: 'Everything' },
]

const COLUMNS = [
  { key: 'text',       label: 'Item' },
  { key: 'type',       label: 'Type' },
  { key: 'domainName', label: 'Domain' },
  { key: 'folderPath', label: 'Folder path' },
  { key: 'done',       label: 'Done' },
  { key: 'created_at', label: 'Created' },
]

export default function Lists({ onOpen }) {
  const s = useStore()
  const [type, setType] = useState('goal')
  const [domain, setDomain] = useState('')
  const [status, setStatus] = useState('open')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'domainName', dir: 1 })

  const domains = domainsSorted(s)

  const rows = useMemo(() => {
    let list = allItems(s, type || null)
    if (domain) list = list.filter((r) => r.domainId === domain)
    if (status === 'open') list = list.filter((r) => !r.done)
    if (status === 'done') list = list.filter((r) => r.done)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((r) =>
        r.text.toLowerCase().includes(needle) ||
        r.folderPath.toLowerCase().includes(needle) ||
        (r.parentText || '').toLowerCase().includes(needle))
    }
    return [...list].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (av === bv) return 0
      return (av > bv ? 1 : -1) * sort.dir
    })
  }, [s, type, domain, status, q, sort])

  const toggleSort = (key) =>
    setSort((cur) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 }))

  return (
    <>
      <div className="sl">Cross-domain lists</div>

      <div className="tabs" style={{ flexWrap: 'wrap', maxWidth: '100%' }}>
        {TABS.map((t) => (
          <button key={t.key} className={`tab${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">All domains</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Not done</option>
          <option value="done">Done</option>
          <option value="all">Any status</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or folder…" />
        <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--dim)' }}>
          {rows.length} result{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="lst">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => {
              const meta = ITEM_TYPES[r.type] || ITEM_TYPES.goal
              return (
                <tr key={r.id} className="lst-row" onClick={() => onOpen?.(r)}
                  title="Open where this lives">
                  <td>
                    <span className={r.done ? 'lst-done' : ''}>{r.text}</span>
                    <span className="lst-go">open ↗</span>
                    {r.parentText && (
                      <div className="td-path" style={{ marginTop: 2 }}>under: {r.parentText}</div>
                    )}
                  </td>
                  <td>
                    <span className="badge" style={{ background: `${meta.color}22`, color: meta.color }}>
                      {meta.short}
                    </span>
                  </td>
                  <td><span className="td-dom" style={{ color: r.domainColor }}>{r.domainName}</span></td>
                  <td className="td-path">{r.folderPath || '—'}</td>
                  <td>
                    <button
                      className="gck"
                      style={r.done ? { background: '#7ec887', borderColor: '#7ec887', color: '#0d0f14' } : undefined}
                      onClick={(e) => { e.stopPropagation(); toggleItem(r.id) }}
                      aria-label={r.done ? 'Mark not done' : 'Mark done'}
                    >
                      {r.done ? '✓' : ''}
                    </button>
                  </td>
                  <td className="td-dt">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan={COLUMNS.length}><div className="empty">Nothing matches those filters</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
