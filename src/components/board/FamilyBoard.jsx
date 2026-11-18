import { useEffect, useMemo, useState } from 'react'
import { dateKey, addDays, fmtKey, fmtDate, fmtTime, fmtTimeShort } from '../../lib/tz'
import {
  buildMembers, eventColor, hexAlpha, dedupeEvents, eventsOn, eventState, findClashes, shortTitle,
  sortTodos, todoColor, dueLabel, goalGroups, bigActions, actionDue, eventDay,
} from '../../lib/board'
import ReviewPanel from './ReviewPanel'
import DeviceLinks from './DeviceLinks'

// The family board on a phone or laptop (/board): the same data as the TV,
// laid out to scroll — today first, then to-dos you can tick off, the week,
// goals and big actions. Two more tabs drive the weekly review shown on the
// TV and manage the TVs' read-only links.

const UNDO_MS = 8 * 1000

function Card({ title, badge, extra, className = '', children }) {
  return (
    <section className={`panel fb-card ${className}`}>
      <div className="sl fb-sl">
        {title}
        {badge != null && <span className="pbadge">{badge}</span>}
        {extra}
      </div>
      {children}
    </section>
  )
}

function EventRow({ e, now, members, clash, showDay }) {
  const { color, label } = eventColor(e, members)
  const state = eventState(e, now)
  return (
    <li className={`fb-ev${state === 'past' ? ' past' : ''}${state === 'live' ? ' live' : ''}${clash ? ' clash' : ''}`}
      style={{ '--m': color, '--m-bg': hexAlpha(color, 0.16) }}>
      <span className="fb-ev-time">
        {showDay && <span className="fb-ev-day">{fmtKey(eventDay(e), { weekday: 'short' })} </span>}
        {e.all_day ? 'All day' : fmtTime(e.starts_at)}
      </span>
      <span className="fb-ev-ti">
        {clash && <span aria-label="Clash">⚠ </span>}
        {shortTitle(e.summary)}
        {state === 'live' && <span className="pill green">now</span>}
        {e.status === 'tentative' && <span className="pill">tentative</span>}
      </span>
      <span className="fb-ev-who">{label}</span>
    </li>
  )
}

function TodayCard({ events, now, today, members, clashIds, error }) {
  const list = eventsOn(events, today, { isToday: true, now })
  return (
    <Card title="Today" badge={list.length || null} className="fb-today">
      {error && !events.length ? <div className="empty">Calendar unavailable right now.</div>
        : list.length ? (
          <ol className="fb-evs">{list.map((e) => <EventRow key={e.id} e={e} now={now} members={members} clash={clashIds.has(e.id)} />)}</ol>
        ) : <div className="empty">Nothing on the calendar today.</div>}
    </Card>
  )
}

function WeekCard({ events, now, today, members, clashIds }) {
  return (
    <Card title="Next 7 days" className="fb-week-card">
      <div className="fb-week">
        {Array.from({ length: 7 }, (_, i) => {
          const key = addDays(today, i)
          const list = eventsOn(events, key, { isToday: i === 0, now })
          return (
            <div key={key} className={`fb-day${i === 0 ? ' today' : ''}`}>
              <div className="fb-day-hd">
                <span className="fb-day-wd">{i === 0 ? 'Today' : fmtKey(key, { weekday: 'short' })}</span>
                <span className="fb-day-dn">{fmtKey(key, { day: 'numeric', month: 'short' })}</span>
              </div>
              {list.length ? (
                <ol className="fb-evs compact">
                  {list.map((e) => <EventRow key={e.id} e={e} now={now} members={members} clash={clashIds.has(e.id)} />)}
                </ol>
              ) : <div className="fb-free">Free</div>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function TodoCard({ todos, members, today, actions }) {
  const [text, setText] = useState('')
  // A ticked row stays (struck through) for a few seconds so a mis-tap can be undone.
  const [recent, setRecent] = useState({})
  useEffect(() => {
    if (!Object.keys(recent).length) return undefined
    const t = setTimeout(() => {
      const cut = Date.now() - UNDO_MS
      setRecent((r) => Object.fromEntries(Object.entries(r).filter(([, at]) => at > cut)))
    }, 1000)
    return () => clearTimeout(t)
  }, [recent])

  const list = sortTodos(todos).filter((t) => !t.done || recent[t.id])
  const open = list.filter((t) => !t.done).length
  const canEdit = !!actions?.toggleTodo

  const tick = (t) => {
    if (!t.done) setRecent((r) => ({ ...r, [t.id]: Date.now() }))
    actions.toggleTodo(t.id)
  }
  const submit = (e) => {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    actions.addTodo(v)
    setText('')
  }

  return (
    <Card title="To-dos" badge={open} className="fb-todos">
      {canEdit && (
        <form className="fb-add" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…"
            aria-label="New to-do" enterKeyHint="done" autoComplete="off" />
          <button type="submit" className="btn-g" disabled={!text.trim()}>Add</button>
        </form>
      )}
      {list.length ? (
        <div className="fb-todo-list">
          {list.map((t) => {
            const due = !t.done && dueLabel(t.due_date, today)
            return (
              <button key={t.id} className={`fb-todo${t.done ? ' done' : ''}`} style={{ '--m': todoColor(t.text, members) }}
                onClick={() => canEdit && tick(t)} disabled={!canEdit}
                aria-pressed={!!t.done} aria-label={`${t.text}: ${t.done ? 'undo' : 'mark done'}`}>
                <span className={`gck${t.done ? ' on' : ''}`} aria-hidden="true">{t.done ? '✓' : ''}</span>
                <span className="fb-todo-tx">{t.text}</span>
                {due && <span className={`fb-due ${due.cls}`}>{due.text}</span>}
                {t.done && <span className="fb-undo">Undo</span>}
              </button>
            )
          })}
        </div>
      ) : <div className="empty">Nothing open. Nice.</div>}
    </Card>
  )
}

function GoalsCard({ data }) {
  const groups = goalGroups(data)
  const total = groups.reduce((n, g) => n + g.goals.length, 0)
  return (
    <Card title="Life goals" badge={total} className="fb-goals">
      {groups.length ? groups.map(({ place, goals }) => (
        <div key={place.key} className="fb-goal-grp" style={{ '--c': place.color || 'var(--acc)' }}>
          <div className="fb-goal-h">{place.emoji ? `${place.emoji} ` : ''}{place.name}<span>{goals.length}</span></div>
          <ul>{goals.map((g) => <li key={g.id}>{g.text}</li>)}</ul>
        </div>
      )) : <div className="empty">No active goals.</div>}
    </Card>
  )
}

function ActionsCard({ data, today }) {
  const rows = bigActions(data, today)
  const overdue = rows.filter((r) => r.due && r.due < today).length
  return (
    <Card title="Big actions" badge={overdue ? `${overdue} overdue` : null} className={`fb-acts${overdue ? ' has-overdue' : ''}`}>
      {rows.length ? rows.map(({ item, due, size, place }) => {
        const d = actionDue(due, today)
        return (
          <div key={item.id} className={`fb-act ${d?.cls || ''}`} style={{ '--c': place.color || 'var(--acc)' }}>
            <div className="fb-act-tx">{item.text}</div>
            <div className="fb-act-meta">
              {d && <span className="fb-act-due">{d.text}</span>}
              {size > 0 && <span>{size} step{size === 1 ? '' : 's'}</span>}
              <span>{place.name}</span>
            </div>
          </div>
        )
      }) : <div className="empty">No open actions.</div>}
    </Card>
  )
}

function ClashBanner({ clashes, members }) {
  if (!clashes.length) return null
  const nm = (id) => members.find((m) => m.id === id)?.name || ''
  const short = (t, who) => shortTitle(t).replace(new RegExp(`^${who}[:']?s?\\s*`, 'i'), '')
  return (
    <div className="fb-clash" role="status">
      <strong>⚠ Clashes</strong>
      <ul>
        {clashes.map((c) => (
          <li key={`${c.first.id}-${c.second.id}`}>
            <b>{fmtKey(eventDay(c.first), { weekday: 'short', day: 'numeric' })}</b> {nm(c.member)}: {short(c.first.summary, nm(c.member))} {fmtTimeShort(c.first.starts_at)}
            {' '}<i>overlaps</i> {short(c.second.summary, nm(c.member))} {fmtTimeShort(c.second.starts_at)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Overview({ board }) {
  const { data } = board
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000)
    return () => clearInterval(t)
  }, [])
  const today = dateKey(now)
  const members = useMemo(() => buildMembers(data.people || []), [data.people])
  const events = useMemo(() => dedupeEvents(data.events || []), [data.events])
  const clashes = useMemo(() => findClashes(events, members, now)
    .filter((c) => eventDay(c.first) < addDays(today, 7)), [events, members, now, today])
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => [c.first.id, c.second.id])), [clashes])

  return (
    <>
      <div className="fb-hdr">
        <div>
          <div className="fb-date">{fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="fb-legend">
            {members.map((m) => <span key={m.id}><i style={{ background: m.color }} />{m.name}</span>)}
          </div>
        </div>
        <div className="fb-clock">{fmtTime(now)}<small>Chicago</small></div>
      </div>
      <ClashBanner clashes={clashes} members={members} />
      <div className="fb-grid">
        <div className="fb-col">
          <TodayCard events={events} now={now} today={today} members={members} clashIds={clashIds} error={board.calendarError} />
          <TodoCard todos={data.todos || []} members={members} today={today} actions={board.actions} />
        </div>
        <div className="fb-col">
          <ActionsCard data={data} today={today} />
          <GoalsCard data={data} />
        </div>
      </div>
      <WeekCard events={events} now={now} today={today} members={members} clashIds={clashIds} />
    </>
  )
}

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'review', label: 'Weekly review' },
  { id: 'screens', label: 'TV screens' },
]

/** `board`: from useMemberBoard() (or useDemoBoard() in local mode). */
export default function FamilyBoard({ board }) {
  const [tab, setTab] = useState('board')
  return (
    <div className="fb">
      <div className="fb-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <a className="fb-tv-link" href={tab === 'review' ? '/tv?mode=review' : '/tv'}>Open TV view ↗</a>
      </div>
      {board.demo && <div className="banner"><p>Demo family — sample data only. Connect Supabase to see yours.</p></div>}
      {board.status === 'loading' && <div className="center">Loading…</div>}
      {board.status === 'error' && <div className="err"><strong>Could not load the board.</strong> {board.error}</div>}
      {board.status === 'ready' && tab === 'board' && <Overview board={board} />}
      {board.status === 'ready' && tab === 'review' && <ReviewPanel board={board} />}
      {tab === 'screens' && <DeviceLinks demo={board.demo} />}
    </div>
  )
}
