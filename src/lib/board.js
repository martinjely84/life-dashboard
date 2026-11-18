// The family board's logic, shared by the TV view and the phone/laptop
// board: who an event belongs to, which events fall on which day,
// clashes, goal groups and the big-actions ranking. Pure functions over
// a board snapshot — no store, no network — so both views (and the TV's
// read-only device mode) show exactly the same thing.
//
// A snapshot: { people, domains, folders, items, todos, events, sources }.
// Events come from board_events(): all-day ones carry start_date/end_date
// (dates, end exclusive), timed ones starts_at/ends_at (instants).

import { dateKey, addDays, daysBetween, fmtKey } from './tz.js'

// ── Family members ───────────────────────────────────────────────────
// From the people table: the first word of each name (plus any aliases)
// matched as a whole word, case-insensitive. 'Family' is everyone.
export const FAMILY = { id: 'family', name: 'Family', color: '#A78BFA' }
const FALLBACK_COLORS = ['#3B82F6', '#F472B6', '#2DD4BF', '#FBBF24', '#F97316', '#84CC16']
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildMembers(people = []) {
  const list = [...people]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)))
    .map((p, i) => {
      const words = [String(p.name || '').trim().split(/\s+/)[0], ...(p.aliases || [])]
        .map((w) => String(w || '').trim().toLowerCase()).filter(Boolean)
      return {
        id: p.id,
        name: String(p.name || p.id).trim().split(/\s+/)[0],
        color: p.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        re: words.length ? new RegExp(`\\b(?:${words.map(escapeRe).join('|')})\\b`, 'i') : null,
      }
    })
  return [...list, FAMILY]
}

/** Ids of the members named in a piece of text (may be several, or none). */
export const membersIn = (text, members) =>
  members.filter((m) => m.re && m.re.test(String(text || ''))).map((m) => m.id)

// Calendars shared by the whole family: an event naming nobody is Family.
const SHARED_SOURCES = new Set(['family', 'skylight', 'board'])

export const SOURCE_COLORS = { family: '#A78BFA', work: '#3B82F6', skylight: '#F59E0B', board: '#A78BFA' }
const EXTRA = ['#14B8A6', '#EC4899', '#84CC16', '#F97316']
export function sourceColor(id) {
  if (SOURCE_COLORS[id]) return SOURCE_COLORS[id]
  let h = 0
  for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return EXTRA[h % EXTRA.length]
}

/** One name → that member; several → Family; none → Family on shared calendars, else null. */
export function eventMember(e, members) {
  const hits = membersIn(e.summary, members).filter((id) => id !== 'family')
  if (hits.length === 1) return hits[0]
  if (hits.length > 1 || SHARED_SOURCES.has(e.source_id)) return 'family'
  return null
}

/** { color, label } for an event: its member's colour, else its calendar's. */
export function eventColor(e, members) {
  const m = members.find((x) => x.id === eventMember(e, members))
  return m ? { color: m.color, label: m.name } : { color: sourceColor(e.source_id), label: e.source_name || e.source_id }
}

/** A to-do's colour: the first member it names, else Family. */
export function todoColor(text, members) {
  const id = membersIn(text, members).find((x) => x !== 'family')
  return (members.find((m) => m.id === id) || FAMILY).color
}

/** '#RRGGBB' → 'rgba(r,g,b,a)' (no color-mix: older TV browsers lack it). */
export function hexAlpha(hex, a) {
  const n = parseInt(String(hex || '#888888').replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ── Events ───────────────────────────────────────────────────────────
const startMs = (e) => Date.parse(e.starts_at)
// Timed events with no (or a zero-length) end count as an hour for overlaps.
const endMs = (e) => {
  const a = startMs(e)
  const b = e.ends_at ? Date.parse(e.ends_at) : a
  return b > a ? b : a + 3600e3
}

/** Chicago date the event starts on (all-day: its start date as stored). */
export const eventDay = (e) => (e.all_day ? e.start_date : dateKey(e.starts_at))

// The same event often arrives from several feeds (invites land in both the
// family and the work calendar). Keep one copy: same UID + start, or same
// title + start/day. Shared family calendars win over work.
const SOURCE_RANK = { skylight: 0, board: 0, family: 1, work: 3 }
const rank = (e) => SOURCE_RANK[e.source_id] ?? 2
const startKey = (e) => (e.all_day ? `d${e.start_date}` : `t${startMs(e)}`)
const titleKey = (e) => String(e.summary || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function dedupeEvents(events = []) {
  const seen = new Set()
  const keep = new Set()
  const byPref = events.map((e, i) => [e, i]).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j)
  for (const [e] of byPref) {
    const keys = [`t:${titleKey(e)}|${startKey(e)}`, `d:${titleKey(e)}|${eventDay(e)}|${e.all_day ? 'a' : 't'}`]
    if (e.uid) keys.push(`u:${e.uid}|${startKey(e)}`)
    const dupe = keys.some((k) => seen.has(k))
    keys.forEach((k) => seen.add(k))
    if (!dupe) keep.add(e)
  }
  return sortEvents(events.filter((e) => keep.has(e)))
}

/** All-day first (by date), then timed by start. */
export const sortEvents = (events) => [...events].sort((a, b) =>
  (b.all_day - a.all_day)
  || (a.all_day ? a.start_date.localeCompare(b.start_date) : startMs(a) - startMs(b))
  || String(a.summary || '').localeCompare(String(b.summary || '')))

/**
 * Events shown on one day: all-day events covering it, then timed events
 * starting on it. Today also lists timed events still running from earlier.
 */
export function eventsOn(events, key, { isToday = false, now = new Date() } = {}) {
  const allDay = events.filter((e) => e.all_day && e.start_date <= key && key < e.end_date)
  const timed = events.filter((e) => {
    if (e.all_day) return false
    const d = dateKey(e.starts_at)
    return d === key || (isToday && d < key && endMs(e) > now.getTime())
  })
  return [...allDay, ...timed]
}

/** past | live | upcoming, for a timed event. All-day events are never past on their day. */
export function eventState(e, now = new Date()) {
  if (e.all_day) return 'upcoming'
  const t = now.getTime()
  if (Date.parse(e.ends_at || e.starts_at) <= t) return 'past'
  return startMs(e) <= t ? 'live' : 'upcoming'
}

/** Strip clock times and venues already shown elsewhere, for a short wall title. */
export const shortTitle = (summary) => String(summary || '')
  .replace(/\s*\d{1,2}(:\d\d)?\s*(am|pm)?\s*-\s*\d{1,2}(:\d\d)?\s*(am|pm)\b/i, '')
  .replace(/\s+\d{1,2}(:\d\d)?\s*(am|pm)\b.*$/i, '')
  .replace(/\s+@.*$/, '')
  .trim() || 'Untitled event'

// ── Clashes ──────────────────────────────────────────────────────────
// Timed events that overlap for the same named person. Two copies of one
// activity (same title once times are stripped) are not a clash.
const activity = (e) => String(e.summary || '').toLowerCase()
  .replace(/\d{1,2}(:\d\d)?\s*(am|pm)?(\s*-\s*\d{1,2}(:\d\d)?\s*(am|pm)?)?/g, '').replace(/\s+/g, ' ').trim()

export function findClashes(events, members, now = new Date()) {
  const timed = events
    .filter((e) => !e.all_day)
    .map((e) => ({ e, m: eventMember(e, members), a: startMs(e), b: endMs(e) }))
    .filter((x) => x.m && x.m !== 'family' && x.b > now.getTime())
  const out = []
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const x = timed[i]
      const y = timed[j]
      if (x.m !== y.m || x.a >= y.b || y.a >= x.b || activity(x.e) === activity(y.e)) continue
      const [first, second] = x.a <= y.a ? [x, y] : [y, x]
      out.push({ member: x.m, first: first.e, second: second.e })
    }
  }
  // One line per event that starts a clash: keep its earliest partner.
  const best = new Map()
  for (const c of out.sort((p, q) => startMs(p.second) - startMs(q.second))) {
    if (!best.has(c.first.id)) best.set(c.first.id, c)
  }
  return [...best.values()].sort((p, q) => startMs(p.first) - startMs(q.first))
}

// ── To-dos ───────────────────────────────────────────────────────────
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

/** Open (or just-ticked) to-dos, dated first: overdue and soonest at the top. */
export const sortTodos = (todos) => [...todos]
  .filter((t) => !t.archived_at)
  .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || bySort(a, b)
    || String(a.created_at || '').localeCompare(String(b.created_at || '')))

/** { text, cls } for a due-date pill, or null. */
export function dueLabel(due, today) {
  if (!due) return null
  if (due < today) return { text: 'Overdue', cls: 'overdue' }
  if (due === today) return { text: 'Today', cls: 'today' }
  if (due === addDays(today, 1)) return { text: 'Tomorrow', cls: '' }
  return { text: fmtKey(due, { day: 'numeric', month: 'short' }), cls: '' }
}

// ── Goals and big actions ────────────────────────────────────────────
const isPersonFolder = (f) => String(f.name || '').startsWith('__person__')

/** folder id → { key, name, emoji, color, order }: its domain, or the person it belongs to. */
export function itemPlaces({ domains = [], folders = [], people = [] }) {
  const dom = new Map(domains.map((d) => [d.id, d]))
  const ppl = new Map(people.map((p) => [p.id, p]))
  const place = new Map()
  for (const f of folders) {
    if (isPersonFolder(f)) {
      const p = ppl.get(f.name.replace('__person__', ''))
      place.set(f.id, { key: `p:${p?.id || f.name}`, name: p?.name || 'Person', emoji: p?.emoji, color: p?.color, order: 1000 + (p?.sort_order ?? 0) })
    } else {
      const d = dom.get(f.domain_id)
      if (d) place.set(f.id, { key: `d:${d.id}`, name: d.name, emoji: d.emoji, color: d.color, order: d.sort_order ?? 0 })
    }
  }
  return place
}

/** Open goals grouped by domain (then person): [{ place, goals }]. */
export function goalGroups(data) {
  const place = itemPlaces(data)
  const groups = new Map()
  ;(data.items || [])
    .filter((i) => i.type === 'goal' && !i.done && !i.archived_at && place.has(i.folder_id))
    .sort(bySort)
    .forEach((g) => {
      const pl = place.get(g.folder_id)
      if (!groups.has(pl.key)) groups.set(pl.key, { place: pl, goals: [] })
      groups.get(pl.key).goals.push(g)
    })
  return [...groups.values()].sort((a, b) => a.place.order - b.place.order || a.place.name.localeCompare(b.place.name))
}

// Items have no due-date column, so a date is read from the text ('due
// 2026-11-02', 'by 3 Nov', 'before Nov 3rd'). Size is the number of open
// steps under the action. Order: dated (overdue, then soonest), then
// biggest, then oldest.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?'
const LEAD = '\\b(?:due|by|before|deadline|until)\\s*:?\\s*(?:[a-z]+day,?\\s+)?'
const RE_ISO = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/
const RE_DM = new RegExp(`${LEAD}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}(?:\\s+(20\\d{2}))?`, 'i')
const RE_MD = new RegExp(`${LEAD}${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?`, 'i')

/** A due date (key) mentioned in the text, or null. */
export function parseDue(text, today) {
  const t = String(text || '')
  const make = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m, d, 12))
    return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
  }
  const year = Number(today.slice(0, 4))
  // No year: this year, unless that was months ago — then next year.
  const guess = (m, d) => {
    const k = make(year, m, d)
    return k && daysBetween(k, today) > 180 ? make(year + 1, m, d) : k
  }
  let x = t.match(RE_ISO)
  if (x) return make(+x[1], +x[2] - 1, +x[3])
  x = t.match(RE_DM)
  if (x) { const m = MONTHS.indexOf(x[2].toLowerCase().slice(0, 3)); return x[3] ? make(+x[3], m, +x[1]) : guess(m, +x[1]) }
  x = t.match(RE_MD)
  if (x) { const m = MONTHS.indexOf(x[1].toLowerCase().slice(0, 3)); return x[3] ? make(+x[3], m, +x[2]) : guess(m, +x[2]) }
  return null
}

export function bigActions(data, today, limit = 15) {
  const place = itemPlaces(data)
  const all = data.items || []
  const doneIds = new Set(all.filter((i) => i.done).map((i) => i.id))
  const openKids = new Map()
  for (const i of all) if (!i.done && i.parent_item_id) openKids.set(i.parent_item_id, (openKids.get(i.parent_item_id) || 0) + 1)
  return all
    .filter((i) => (i.type === 'action' || i.type === 'task') && !i.done && !i.archived_at
      && !doneIds.has(i.parent_item_id) && place.has(i.folder_id))
    .map((i) => ({ item: i, due: parseDue(i.text, today), size: openKids.get(i.id) || 0, place: place.get(i.folder_id) }))
    .sort((a, b) => (!!b.due - !!a.due) || (a.due && b.due && a.due.localeCompare(b.due))
      || b.size - a.size || String(a.item.created_at || '').localeCompare(String(b.item.created_at || '')))
    .slice(0, limit)
}

/** 'Overdue · 3 Nov' / 'Due today' / 'Due Fri 21 Nov', with a class. */
export function actionDue(due, today) {
  if (!due) return null
  const days = daysBetween(today, due)
  if (days < 0) return { text: `Overdue · ${fmtKey(due, { day: 'numeric', month: 'short' })}`, cls: 'overdue' }
  if (days === 0) return { text: 'Due today', cls: 'soon' }
  if (days === 1) return { text: 'Due tomorrow', cls: 'soon' }
  return { text: `Due ${fmtKey(due, { weekday: days < 7 ? 'short' : undefined, day: 'numeric', month: 'short' })}`, cls: days <= 3 ? 'soon' : '' }
}

// ── Weekly review ────────────────────────────────────────────────────
// The fixed 35-minute agenda (+5 buffer), as on the box.
export const REVIEW_STEPS = [
  { n: 1, name: 'Check-in and wins', minutes: 3 },
  { n: 2, name: "Last week's actions", minutes: 4 },
  { n: 3, name: 'Next 7 days', minutes: 6 },
  { n: 4, name: 'To-dos and open items', minutes: 6 },
  { n: 5, name: 'Decisions needed', minutes: 5 },
  { n: 6, name: 'Deep-dive slot', minutes: 8 },
  { n: 7, name: 'Summary and week ahead', minutes: 3 },
]
export const REVIEW_TOTAL_MIN = REVIEW_STEPS.reduce((s, x) => s + x.minutes, 0)
export const REVIEW_BUFFER_MIN = 5
export const CARD_KINDS = [
  { kind: 'win', title: 'Wins', add: 'Add a win…', empty: 'No wins yet — start with one!' },
  { kind: 'decision', title: 'Decisions', add: 'Add a decision…', empty: 'No decisions needed.' },
  { kind: 'parked', title: 'Parked', add: 'Park a topic…', empty: 'Nothing parked.' },
]

/** { status, elapsedMs, step } from a review_session row, at server time `nowMs`. */
export function reviewTimer(row, nowMs) {
  const step = Math.min(7, Math.max(1, Number(row?.step) || 1))
  const base = Number(row?.elapsed_before_pause_ms) || 0
  if (row?.started_at && !row?.paused_at) {
    return { step, status: 'running', elapsedMs: base + Math.max(0, nowMs - Date.parse(row.started_at)) }
  }
  return { step, status: row?.paused_at ? 'paused' : 'idle', elapsedMs: base }
}

/** mm:ss of a duration in ms (always positive; caller adds a sign). */
export function fmtClock(ms) {
  const s = Math.floor(Math.abs(ms) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
