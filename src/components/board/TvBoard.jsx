import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dateKey, addDays, fmtKey, fmtDate, fmtTime, fmtTimeShort } from '../../lib/tz'
import {
  buildMembers, eventColor, hexAlpha, dedupeEvents, eventsOn, eventState, findClashes, shortTitle,
  sortTodos, todoColor, dueLabel, goalGroups, bigActions, actionDue, eventDay,
  REVIEW_STEPS, REVIEW_TOTAL_MIN, REVIEW_BUFFER_MIN, CARD_KINDS, reviewTimer, fmtClock,
} from '../../lib/board'

// The TV view (/tv): a 1920×1080 wall board read from across the room.
// Dark, no scrolling, no interaction — it pages and refreshes on its own.
// Big date + clock and the colour key, a clash banner, the 7-day week, then
// to-dos, life goals and big actions. Panels that overflow page every 15 s;
// a day that overflows shows "+N more".
// Review mode (?mode=review) is the weekly family review on the wall: theme,
// a shorter week, the shared step timer and the Wins / Decisions / Parked
// cards. It's driven from a phone or laptop (Family board → Weekly review).

const WEEK_DAYS = 7
const PAGE_MS = 15 * 1000
// Chip geometry in rem; must match .tv-chip / .tv-more / .tv-col-body in tv.css.
const CHIP_REM = 3.0
const CHIP_COMPACT_REM = 1.3
const MORE_REM = 1.4
const MORE_COMPACT_REM = 1.1
const CHIP_GAP_REM = 0.3
const MIN_CHIPS = 2

// ── Paging ───────────────────────────────────────────────────────────
// Renders every item, measures them and shows one page at a time. A page
// that starts inside a group repeats the group's header at the top.
function Paged({ items, onPageInfo }) {
  const boxRef = useRef(null)
  const innerRef = useRef(null)
  const [layout, setLayout] = useState({ pages: [{ s: 0, e: Infinity, top: 0, head: -1 }], hdrH: 0 })
  const [page, setPage] = useState(0)

  const measure = useCallback(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return
    const H = box.clientHeight
    const kids = [...inner.children]
    const n = kids.length
    const firstHead = items.findIndex((it) => it.head)
    const hdrH = firstHead >= 0 && kids[firstHead] ? kids[firstHead].offsetHeight : 0
    const pages = []
    let s = 0
    while (s < n) {
      let head = -1
      if (!items[s].head) for (let i = s - 1; i >= 0; i--) if (items[i].head) { head = i; break }
      const avail = H - (head >= 0 ? hdrH : 0)
      const top = kids[s].offsetTop
      let e = s + 1
      while (e < n && kids[e].offsetTop + kids[e].offsetHeight - top <= avail) e++
      if (e - s > 1 && e < n && items[e - 1].head) e-- // don't strand a header at the bottom
      pages.push({ s, e, top, head })
      s = e
    }
    if (!pages.length) pages.push({ s: 0, e: 0, top: 0, head: -1 })
    const next = { pages, hdrH }
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [items])

  useLayoutEffect(measure)
  useEffect(() => {
    const ro = new ResizeObserver(() => measure())
    if (boxRef.current) ro.observe(boxRef.current)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [measure])

  const count = layout.pages.length
  const p = Math.min(page, count - 1)
  useEffect(() => { onPageInfo?.({ page: p, count }) }, [p, count, onPageInfo])
  useEffect(() => {
    if (count < 2) return undefined
    const t = setInterval(() => setPage((x) => (x + 1) % count), PAGE_MS)
    return () => clearInterval(t)
  }, [count])

  const cur = layout.pages[p]
  const shift = cur.top - (cur.head >= 0 ? layout.hdrH : 0)
  return (
    <div className="tv-paged" ref={boxRef}>
      {cur.head >= 0 && <div className="tv-pg-cont" aria-hidden="true">{items[cur.head].node}</div>}
      <div className="tv-pg-inner" ref={innerRef} style={{ transform: `translateY(${-shift}px)` }}>
        {items.map((it, i) => (
          <div key={it.key} className="tv-pg-item" style={{ visibility: i >= cur.s && i < cur.e ? 'visible' : 'hidden' }}>
            {it.node}
          </div>
        ))}
      </div>
    </div>
  )
}

function PageDots({ info }) {
  if (!info || info.count < 2) return null
  return (
    <span className="tv-dots" aria-label={`Page ${info.page + 1} of ${info.count}`}>
      {Array.from({ length: info.count }, (_, i) => <span key={i} className={i === info.page ? 'on' : ''} />)}
    </span>
  )
}

function Panel({ title, badge, extra, className = '', children }) {
  return (
    <section className={`tv-panel ${className}`}>
      <div className="tv-panel-hd">
        <h2>{title}</h2>
        {badge != null && <span className="tv-badge">{badge}</span>}
        {extra}
      </div>
      {children}
    </section>
  )
}

function PagedPanel({ title, badge, className, items, empty }) {
  const [pg, setPg] = useState(null)
  return (
    <Panel title={title} badge={badge} className={className} extra={<PageDots info={pg} />}>
      {items.length ? <Paged items={items} onPageInfo={setPg} /> : <div className="tv-empty">{empty}</div>}
    </Panel>
  )
}

// ── Header ───────────────────────────────────────────────────────────

function Clock({ offsetMs }) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <div className="tv-clock">{fmtTime(t + offsetMs)}</div>
}

function Legend({ members, sources }) {
  const broken = (sources || []).filter((s) => s.last_status === 'error')
  return (
    <div className="tv-legend">
      {members.map((m) => (
        <span key={m.id} className="tv-legend-i"><span className="tv-sw" style={{ background: m.color }} />{m.name}</span>
      ))}
      {broken.map((s) => <span key={s.id} className="tv-legend-i tv-warn">{s.name} feed !</span>)}
    </div>
  )
}

// ── Calendar: 7-day week ─────────────────────────────────────────────

function Chip({ e, now, members, compact, clash }) {
  const state = eventState(e, now)
  const { color, label } = eventColor(e, members)
  const title = shortTitle(e.summary)
  const time = e.all_day ? 'All day' : fmtTime(e.starts_at)
  const cls = `tv-chip${clash ? ' clash' : ''}${state === 'past' ? ' past' : ''}${state === 'live' ? ' live' : ''}${e.status === 'tentative' ? ' tent' : ''}`
  return (
    <div className={cls} style={{ '--m': color, '--m-bg': hexAlpha(color, 0.24) }} title={`${time} ${title} · ${label}`}>
      {compact ? (
        <span className="tv-chip-ln">{clash ? '⚠ ' : ''}<span className="tv-chip-time">{time}</span> {title}</span>
      ) : (
        <span className="tv-chip-ti"><span className="tv-chip-time">{clash ? '⚠ ' : ''}{time}{state === 'live' ? ' · now' : ''}</span> {title}</span>
      )}
    </div>
  )
}

// How many chips fit a column of `h` px: all of them if they fit, otherwise
// as many as leave room for "+N more" — never fewer than MIN_CHIPS (or 1).
function chipsThatFit(h, count, compact, rem) {
  const chip = (compact ? CHIP_COMPACT_REM : CHIP_REM) * rem
  const more = (compact ? MORE_COMPACT_REM : MORE_REM) * rem
  const gap = CHIP_GAP_REM * rem
  if (count * chip + (count - 1) * gap <= h) return count
  const withMore = Math.floor((h - more) / (chip + gap))
  const floor = MIN_CHIPS * chip + (MIN_CHIPS - 1) * gap <= h ? MIN_CHIPS : 1
  return Math.min(count, Math.max(withMore, floor))
}

function DayCol({ dayKey, idx, events, now, members, compact, clashIds }) {
  const bodyRef = useRef(null)
  const [geo, setGeo] = useState(null)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return undefined
    const calc = () => setGeo({ h: body.clientHeight, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 })
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(body)
    return () => ro.disconnect()
  }, [])

  const fit = geo ? chipsThatFit(geo.h, events.length, compact, geo.rem) : events.length
  let list = events
  // Today: finished events give way first.
  if (fit < list.length && idx === 0) {
    const upcoming = list.filter((e) => eventState(e, now) !== 'past')
    list = upcoming.length ? upcoming : list.slice(-fit)
  }
  const shown = list.slice(0, fit)
  const more = events.length - shown.length

  return (
    <div className={`tv-col${idx === 0 ? ' today' : ''}`}>
      <div className="tv-col-hd">
        <span className="tv-col-wd">{idx === 0 ? 'Today' : fmtKey(dayKey, { weekday: 'short' })}</span>
        <span className="tv-col-dn">{fmtKey(dayKey, { day: 'numeric' })}</span>
      </div>
      <div className="tv-col-body" ref={bodyRef}>
        {!events.length && <div className="tv-col-none">Free</div>}
        {shown.map((e) => <Chip key={e.id} e={e} now={now} members={members} compact={compact} clash={clashIds.has(e.id)} />)}
        {more > 0 && <div className="tv-more">+{more} more</div>}
      </div>
    </div>
  )
}

function WeekView({ today, now, events, members, clashIds, error, compact = false }) {
  return (
    <section className="tv-cal" aria-label="Calendar, next 7 days">
      {error && !events.length ? <div className="tv-empty">Calendar unavailable — retrying.</div> : (
        <div className={`tv-week${compact ? ' compact' : ''}`}>
          {Array.from({ length: WEEK_DAYS }, (_, i) => {
            const key = addDays(today, i)
            return (
              <DayCol key={key} dayKey={key} idx={i} events={eventsOn(events, key, { isToday: i === 0, now })}
                now={now} members={members} compact={compact} clashIds={clashIds} />
            )
          })}
        </div>
      )}
    </section>
  )
}

function ClashBar({ clashes, members }) {
  if (!clashes.length) return null
  const nm = (id) => members.find((m) => m.id === id)?.name || ''
  const short = (t, who) => shortTitle(t).replace(new RegExp(`^${who}[:']?s?\\s*`, 'i'), '').slice(0, 40)
  return (
    <section className="tv-clashbar" aria-label="Clashes this week">
      <span className="tv-clash-h">⚠ Clashes</span>
      <div className="tv-clash-list">
        {clashes.map((c) => (
          <span key={`${c.first.id}-${c.second.id}`} className="tv-clash-i">
            <b>{fmtKey(eventDay(c.first), { weekday: 'short', day: 'numeric' })}</b> {nm(c.member)}: {short(c.first.summary, nm(c.member))} {fmtTimeShort(c.first.starts_at)}
            {' '}<i>overlaps</i> {short(c.second.summary, nm(c.member))} {fmtTimeShort(c.second.starts_at)}
          </span>
        ))}
      </div>
    </section>
  )
}

// ── Bottom panels ────────────────────────────────────────────────────

function TodoPanel({ todos, members, today }) {
  const open = sortTodos(todos).filter((t) => !t.done)
  const items = open.map((t) => {
    const due = dueLabel(t.due_date, today)
    return {
      key: t.id,
      node: (
        <div className="tv-todo" style={{ '--m': todoColor(t.text, members) }}>
          <span className="tv-ck" aria-hidden="true" />
          <span className="tv-todo-tx">{t.text}</span>
          {due && <span className={`tv-todo-due ${due.cls}`}>{due.text}</span>}
        </div>
      ),
    }
  })
  return <PagedPanel title="To-dos" badge={open.length} className="tv-todos" items={items} empty="Nothing open. Nice." />
}

function GoalsPanel({ data }) {
  const groups = goalGroups(data)
  const items = []
  let total = 0
  for (const { place, goals } of groups) {
    total += goals.length
    const c = place.color || 'var(--tv-hi)'
    items.push({ key: `h${place.key}`, head: true, node: <div className="tv-sec-h" style={{ '--c': c }}>{place.emoji ? `${place.emoji} ` : ''}{place.name}<span>{goals.length}</span></div> })
    for (const g of goals) items.push({ key: g.id, node: <div className="tv-line" style={{ '--c': c }}>{g.text}</div> })
  }
  return <PagedPanel title="Life goals" badge={total} className="tv-goals" items={items} empty="No active goals." />
}

function ActionsPanel({ data, today }) {
  const rows = bigActions(data, today)
  const overdue = rows.filter((r) => r.due && r.due < today).length
  const items = rows.map(({ item, due, size, place }) => {
    const d = actionDue(due, today)
    return {
      key: item.id,
      node: (
        <div className={`tv-act ${d?.cls || ''}`} style={{ '--c': place.color || 'var(--tv-hi)' }}>
          <div className="tv-act-tx">{item.text}</div>
          <div className="tv-act-meta">
            {d && <span className="tv-due">{d.text}</span>}
            {size > 0 && <span>{size} step{size === 1 ? '' : 's'}</span>}
            <span className="tv-act-pl">{place.name}</span>
          </div>
        </div>
      ),
    }
  })
  return (
    <PagedPanel title="Big actions" badge={overdue ? `${overdue} overdue` : null}
      className={`tv-acts${overdue ? ' has-overdue' : ''}`} items={items} empty="No open actions." />
  )
}

// ── Weekly review (display only) ─────────────────────────────────────

function ReviewTimer({ session, offsetMs }) {
  const [, tick] = useState(0)
  const { step, status, elapsedMs } = reviewTimer(session, Date.now() + offsetMs)
  useEffect(() => {
    if (status !== 'running') return undefined
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [status])
  const info = REVIEW_STEPS[step - 1]
  const remaining = info.minutes * 60e3 - elapsedMs
  const over = remaining <= 0
  const nudge = !over && remaining <= 60e3
  const clock = over ? `+${fmtClock(-remaining)}` : fmtClock(Math.ceil(remaining / 1000) * 1000)
  const sub = over ? 'Over time — wrap up and move on'
    : nudge ? 'One minute left'
      : `${info.minutes} min · agenda ${REVIEW_TOTAL_MIN} min + ${REVIEW_BUFFER_MIN} buffer`
  return (
    <section className={`tv-panel tv-timer${over ? ' over' : nudge ? ' nudge' : ''}${status !== 'running' ? ' stopped' : ''}`}
      aria-label="Review step timer">
      <div className="tv-tm-top">
        <span className="tv-tm-n">Step {step} of {REVIEW_STEPS.length}</span>
        <span className={`tv-tm-st ${status}`}>{{ idle: 'Ready', running: 'Running', paused: 'Paused' }[status]}</span>
      </div>
      <div className="tv-tm-name">{info.name}</div>
      <div className="tv-tm-clock" role="timer" aria-live="off">{clock}</div>
      <div className="tv-tm-sub">{sub}</div>
      <div className="tv-tm-bar" aria-hidden="true">
        {REVIEW_STEPS.map((st) => (
          <span key={st.n} style={{ flexGrow: st.minutes }} className={st.n < step ? 'done' : st.n === step ? 'on' : ''} />
        ))}
      </div>
    </section>
  )
}

function ReviewCards({ cards }) {
  return CARD_KINDS.map(({ kind, title, empty }) => {
    const list = cards.filter((c) => c.kind === kind)
    const sorted = [...list.filter((c) => !c.done), ...list.filter((c) => c.done)]
    const items = sorted.map((c) => ({
      key: c.id,
      node: (
        <div className={`tv-todo tv-card${c.done ? ' done' : ''}`}>
          <span className="tv-ck" aria-hidden="true">{c.done ? '✓' : ''}</span>
          <span className="tv-todo-tx">{c.text}</span>
        </div>
      ),
    }))
    return <PagedPanel key={kind} title={title} badge={list.length} className={`tv-cards k-${kind}`} items={items} empty={empty} />
  })
}

// ── Page ─────────────────────────────────────────────────────────────

/** `board`: what useMemberBoard / useDeviceBoard / useDemoBoard return. */
export default function TvBoard({ board, review = false, note }) {
  const { data, offsetMs = 0 } = board
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs))
  useEffect(() => {
    setNow(new Date(Date.now() + offsetMs))
    const t = setInterval(() => setNow(new Date(Date.now() + offsetMs)), 15 * 1000)
    return () => clearInterval(t)
  }, [offsetMs])
  const today = dateKey(now)

  const members = useMemo(() => buildMembers(data?.people || []), [data?.people])
  const events = useMemo(() => dedupeEvents(data?.events || []), [data?.events])
  const clashes = useMemo(() => findClashes(events, members, now)
    .filter((c) => eventDay(c.first) < addDays(today, WEEK_DAYS)), [events, members, now, today])
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => [c.first.id, c.second.id])), [clashes])

  return (
    <div className="tv">
      <header className="tv-hdr">
        <div className="tv-date">
          <span className="tv-date-wd">{fmtDate(now, { weekday: 'long' })}</span>
          <span className="tv-date-dm">{fmtDate(now, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <Legend members={members} sources={data?.sources} />
        <Clock offsetMs={offsetMs} />
      </header>

      {!data ? (
        <div className="tv-empty tv-loading">{board.status === 'error' ? 'Can’t reach the board — retrying…' : 'Loading…'}</div>
      ) : review ? (
        <main className="tv-main review">
          <div className="tv-banner">
            <span className="tv-banner-lb">Week {Number(data.review?.week?.split('-W')[1])} · theme</span>
            <span className={`tv-banner-tx${data.review?.theme ? '' : ' empty'}`}>{data.review?.theme || 'No theme set yet'}</span>
          </div>
          <WeekView today={today} now={now} events={events} members={members} clashIds={clashIds} compact />
          <div className="tv-rv-bottom">
            <ReviewTimer session={data.review?.session} offsetMs={offsetMs} />
            <div className="tv-stage-body"><ReviewCards cards={data.review?.cards || []} /></div>
          </div>
        </main>
      ) : (
        <>
          <ClashBar clashes={clashes} members={members} />
          <main className="tv-main">
            <WeekView today={today} now={now} events={events} members={members} clashIds={clashIds} error={board.calendarError} />
            <div className="tv-bottom">
              <TodoPanel todos={data.todos || []} members={members} today={today} />
              <GoalsPanel data={data} />
              <ActionsPanel data={data} today={today} />
            </div>
          </main>
        </>
      )}

      {(board.stale || note) && (
        <div className={`tv-status${board.stale ? ' stale' : ''}`}>
          {board.stale ? `Offline — showing ${board.updatedAt ? fmtTime(board.updatedAt) : 'last'} data` : note}
        </div>
      )}
    </div>
  )
}
