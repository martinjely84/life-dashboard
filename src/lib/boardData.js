// Where the family board's data comes from. Three sources, one shape:
//
//   useMemberBoard()      signed-in family member: the shared store (to-dos,
//                         goals… with optimistic ticks) + the calendar and
//                         weekly review straight from Supabase, live.
//   useDeviceBoard(token) a TV with a device link: board_snapshot(token),
//                         read-only, polled. No account, no table access.
//   useDemoBoard()        no Supabase configured: the made-up sample family.
//
// Each returns { status, error, stale, data, updatedAt, offsetMs, actions }
// where data = { people, domains, folders, items, todos, events, sources,
// review: { week, theme, cards, session } } and offsetMs is server clock −
// local clock (keeps the review timer honest on a TV with a wrong clock).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './backend'
import { useStore, toggleTodo, addTodo } from './store'
import { dateKey, addDays, isoWeek } from './tz'
import { sampleBoard } from './sampleBoard'

const CAL_REFRESH_MS = 5 * 60 * 1000
export const DEVICE_POLL_MS = 60 * 1000
export const DEVICE_POLL_REVIEW_MS = 10 * 1000

/** Chicago "today", re-rendering when the date changes. */
export function useToday() {
  const [today, setToday] = useState(() => dateKey())
  useEffect(() => {
    const t = setInterval(() => setToday(dateKey()), 30 * 1000)
    return () => clearInterval(t)
  }, [])
  return today
}

// Re-run `fn` (debounced) whenever any of `tables` changes in Supabase.
function useRealtime(name, tables, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!supabase) return undefined
    let t = null
    const kick = () => { clearTimeout(t); t = setTimeout(() => ref.current(), 400) }
    const ch = supabase.channel(name)
    tables.forEach((table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, kick))
    ch.subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [name, tables.join()]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Signed-in member ─────────────────────────────────────────────────
const CAL_TABLES = ['calendar_events', 'calendar_sources']
const REVIEW_TABLES = ['review_weeks', 'review_cards', 'review_session']

export function useMemberBoard() {
  const s = useStore()
  const today = useToday()
  const week = isoWeek(today)
  const [cal, setCal] = useState({ loaded: false, events: [], sources: [], error: null })
  const [review, setReview] = useState({ week, theme: '', cards: [], session: null })

  const loadCal = useCallback(async () => {
    const [ev, src] = await Promise.all([
      // A day either side of the week, so no edge is ever missed.
      supabase.rpc('board_events', { p_from: addDays(today, -1), p_days: 9 }),
      supabase.from('calendar_sources').select('id,name,last_status,last_synced_at').is('archived_at', null),
    ])
    const error = ev.error || src.error
    if (error) setCal((c) => ({ ...c, loaded: true, error: error.message }))
    else setCal({ loaded: true, events: ev.data || [], sources: src.data || [], error: null })
  }, [today])

  const loadReview = useCallback(async () => {
    const [w, c, r] = await Promise.all([
      supabase.from('review_weeks').select('theme').eq('id', week).maybeSingle(),
      supabase.from('review_cards').select('id,kind,text,done,created_at').eq('week', week).is('archived_at', null).order('created_at'),
      supabase.from('review_session').select('*').eq('id', 1).maybeSingle(),
    ])
    if (w.error || c.error || r.error) return
    setReview({ week, theme: w.data?.theme || '', cards: c.data || [], session: r.data })
  }, [week])

  useEffect(() => { loadCal() }, [loadCal])
  useEffect(() => { loadReview() }, [loadReview])
  useEffect(() => {
    const t = setInterval(loadCal, CAL_REFRESH_MS)
    return () => clearInterval(t)
  }, [loadCal])
  useRealtime('board-calendar', CAL_TABLES, loadCal)
  useRealtime('board-review', REVIEW_TABLES, loadReview)

  return {
    status: s.status === 'ready' && cal.loaded ? 'ready' : s.status === 'error' ? 'error' : 'loading',
    error: s.error || cal.error,
    calendarError: cal.error,
    stale: false,
    updatedAt: Date.now(),
    offsetMs: 0,
    data: {
      people: s.people, domains: s.domains, folders: s.folders, items: s.items,
      todos: (s.todos || []).filter((t) => !t.archived_at),
      events: cal.events, sources: cal.sources, review,
    },
    actions: { toggleTodo, addTodo, reloadReview: loadReview },
  }
}

// ── TV device link ───────────────────────────────────────────────────
const TOKEN_KEY = 'fb-device-token'

/** Token from the URL fragment (#k=…), remembered in localStorage. */
export function deviceToken() {
  const m = window.location.hash.match(/(?:^#|&)k=([A-Za-z0-9_-]{32,128})/)
  try {
    if (m) localStorage.setItem(TOKEN_KEY, m[1])
    return m ? m[1] : localStorage.getItem(TOKEN_KEY)
  } catch {
    return m ? m[1] : null
  }
}
export const forgetDeviceToken = () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

export function useDeviceBoard(token, { fast = false } = {}) {
  const [st, setSt] = useState({ status: 'loading', data: null, error: null, stale: false, updatedAt: null, offsetMs: 0 })
  const load = useCallback(async () => {
    const sent = Date.now()
    const { data, error } = await supabase.rpc('board_snapshot', { p_token: token })
    if (error) {
      const revoked = /invalid device link/i.test(error.message) || error.code === '28000'
      // Keep showing the last good board through a network blip; say so.
      setSt((p) => (revoked
        ? { ...p, status: 'revoked', data: null, error: error.message }
        : { ...p, status: p.data ? 'ready' : 'error', stale: !!p.data, error: error.message }))
      return
    }
    const mid = (sent + Date.now()) / 2
    setSt({
      status: 'ready', data, error: null, stale: false, updatedAt: Date.now(),
      offsetMs: Date.parse(data.server_now) - mid,
    })
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, fast ? DEVICE_POLL_REVIEW_MS : DEVICE_POLL_MS)
    return () => clearInterval(t)
  }, [load, fast])
  // Catch up straight away when the TV wakes or the tab comes back.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', load)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', load) }
  }, [load])

  return { ...st, actions: null }
}

// ── Demo (no Supabase) ───────────────────────────────────────────────
export function useDemoBoard() {
  const today = useToday()
  const [data, setData] = useState(() => sampleBoard())
  useEffect(() => { setData(sampleBoard()) }, [today])
  const toggle = useCallback((id) => setData((d) => ({
    ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
  })), [])
  const add = useCallback((text) => setData((d) => ({
    ...d, todos: [...d.todos, { id: crypto.randomUUID(), text, done: false, due_date: null, sort_order: d.todos.length }],
  })), [])
  return {
    status: 'ready', error: null, stale: false, updatedAt: Date.now(), offsetMs: 0, demo: true,
    data, actions: { toggleTodo: toggle, addTodo: add },
  }
}
