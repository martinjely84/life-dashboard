// Two interchangeable persistence backends behind one tiny interface.
//
//   supabaseBackend — real Postgres, syncs across every device
//   localBackend    — localStorage only, used when no Supabase env vars are set
//
// Both expose: load(), insert(), update(), remove(), subscribe().
// The store above them does not know or care which one it is talking to.

import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL?.trim()
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const hasSupabase = Boolean(URL && KEY)

export const TABLES = ['domains', 'folders', 'items', 'people', 'todos', 'habits']

const LOCAL_KEY = 'mld-v1'

// ── LOCAL ────────────────────────────────────────────────────────────
function localBackend() {
  const empty = () => Object.fromEntries(TABLES.map((t) => [t, []]))

  const readAll = () => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      // Merge over the empty shape so a store written before a new table
      // existed still comes back with that key present.
      if (raw) return { ...empty(), ...JSON.parse(raw) }
    } catch { /* corrupt or unavailable — fall through to empty */ }
    return empty()
  }

  let db = readAll()
  const listeners = new Set()

  const flush = () => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(db))
    } catch (e) {
      console.warn('Could not write to localStorage', e)
    }
  }

  // Keep other tabs on the same machine in step.
  window.addEventListener('storage', (e) => {
    if (e.key !== LOCAL_KEY) return
    db = readAll()
    listeners.forEach((fn) => fn())
  })

  return {
    kind: 'local',
    async load() {
      db = readAll()
      return structuredClone(db)
    },
    async insert(table, rows) {
      db[table] = [...(db[table] || []), ...rows]
      flush()
      return rows
    },
    async update(table, id, patch) {
      db[table] = (db[table] || []).map((r) => (r.id === id ? { ...r, ...patch } : r))
      flush()
    },
    async remove(table, id) {
      db[table] = (db[table] || []).filter((r) => r.id !== id)
      flush()
    },
    subscribe() {
      return () => {}
    },
  }
}

// ── SUPABASE ─────────────────────────────────────────────────────────
function supabaseBackend() {
  const sb = createClient(URL, KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })

  return {
    kind: 'supabase',
    client: sb,
    async load() {
      const out = {}
      await Promise.all(
        TABLES.map(async (t) => {
          const { data, error } = await sb.from(t).select('*')
          if (error) throw new Error(`${t}: ${error.message}`)
          out[t] = data || []
        }),
      )
      return out
    },
    async insert(table, rows) {
      const { data, error } = await sb.from(table).insert(rows).select()
      if (error) throw new Error(`insert ${table}: ${error.message}`)
      return data
    },
    async update(table, id, patch) {
      const { error } = await sb.from(table).update(patch).eq('id', id)
      if (error) throw new Error(`update ${table}: ${error.message}`)
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) throw new Error(`delete ${table}: ${error.message}`)
    },
    subscribe(onChange) {
      const ch = sb.channel('life-dashboard')
      TABLES.forEach((t) => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange)
      })
      ch.subscribe()
      return () => sb.removeChannel(ch)
    },
  }
}

export const backend = hasSupabase ? supabaseBackend() : localBackend()
