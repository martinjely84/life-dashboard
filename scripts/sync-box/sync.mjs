#!/usr/bin/env node
// Push the box's Command Centre to-dos and calendar into Supabase.
//
//   node scripts/sync-box/sync.mjs [--env PATH] [--db PATH] [--dry-run]
//                                  [--only todos|calendar] [--check-db]
//
// • Opens the box SQLite database READ-ONLY (Node's built-in node:sqlite,
//   Node 22.5+). Nothing on the box is ever written.
// • Talks to Supabase's REST API with the service-role key from an env
//   file (default ~/.config/family-board/supabase.env). Key values are
//   never printed.
// • Idempotent: run it as often as you like (cron/systemd every 5 min).
//
// Full instructions: docs/BOX_SYNC.md.

import { readFileSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mapEvent, mapSource, mergeTodo, parseEnv, serviceKeyProblem } from './map.mjs'

const DEFAULT_ENV = join(homedir(), '.config', 'family-board', 'supabase.env')
const DEFAULT_DB = '/home/box/command-centre/data/cc.db'
const CHUNK = 500

// ── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
if (flag('--help') || flag('-h')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}
const DRY = flag('--dry-run')
const CHECK_DB = flag('--check-db')
const ONLY = opt('--only')
if (ONLY && !['todos', 'calendar'].includes(ONLY)) fail('--only must be todos or calendar')

function fail(msg) {
  console.error(`sync: ${msg}`)
  process.exit(1)
}
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a)

// ── Config ───────────────────────────────────────────────────────────
function loadConfig() {
  const envPath = opt('--env') || process.env.FAMILY_BOARD_ENV || DEFAULT_ENV
  let env = {}
  if (existsSync(envPath)) {
    const st = statSync(envPath)
    if (st.mode & 0o077) console.warn(`sync: warning: ${envPath} is readable by other users — run: chmod 600 ${envPath}`)
    env = parseEnv(readFileSync(envPath, 'utf8'))
  } else if (!CHECK_DB) {
    fail(`env file not found: ${envPath} (see docs/BOX_SYNC.md)`)
  }
  const get = (k) => process.env[k] || env[k]
  return {
    url: (get('SUPABASE_URL') || '').replace(/\/+$/, ''),
    key: get('SUPABASE_SERVICE_ROLE_KEY') || '',
    db: opt('--db') || get('CC_DB_PATH') || DEFAULT_DB,
    sources: (get('SYNC_CALENDAR_SOURCES') || '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}

// ── Box (read-only) ──────────────────────────────────────────────────
async function readBox(dbPath) {
  let DatabaseSync
  try { ({ DatabaseSync } = await import('node:sqlite')) } catch {
    fail(`node:sqlite is not available in Node ${process.versions.node}; use Node 22.5 or newer`)
  }
  if (!existsSync(dbPath)) fail(`box database not found: ${dbPath}`)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name))
    const todoCols = cols('todos')
    const pick = (c) => (todoCols.has(c) ? c : `NULL AS ${c}`)
    const todos = db.prepare(`SELECT id, text, done, sort_order, created_at, ${pick('owner')}, ${pick('archived_at')}, ${pick('due_date')} FROM todos`).all()
    const sources = db.prepare('SELECT id, name, last_synced_at, last_status, last_error, archived_at FROM calendar_sources').all()
    const events = db.prepare(`SELECT id, source_id, uid, recurrence_id, summary, location, starts_at, ends_at,
                                      all_day, status, archived_at FROM calendar_events`).all()
    return { todos, sources, events }
  } finally {
    db.close()
  }
}

// ── Supabase REST ────────────────────────────────────────────────────
function restClient({ url, key }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  async function call(method, path, body, prefer) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} /${path.split('?')[0]} → HTTP ${res.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }
  return {
    async selectAll(table, query) {
      const out = []
      for (let offset = 0; ; offset += 1000) {
        const page = await call('GET', `${table}?${query}&limit=1000&offset=${offset}`)
        out.push(...page)
        if (page.length < 1000) return out
      }
    },
    async upsert(table, rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await call('POST', `${table}?on_conflict=id`, rows.slice(i, i + CHUNK), 'resolution=merge-duplicates,return=minimal')
      }
    },
    async insert(table, rows) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await call('POST', table, rows.slice(i, i + CHUNK), 'return=minimal')
      }
    },
    async archive(table, ids, at) {
      for (let i = 0; i < ids.length; i += 100) {
        const list = ids.slice(i, i + 100).map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')
        await call('PATCH', `${table}?id=in.(${encodeURIComponent(list)})&archived_at=is.null`, { archived_at: at }, 'return=minimal')
      }
    },
  }
}

// ── Sync steps ───────────────────────────────────────────────────────
async function syncTodos(rest, box, now) {
  const remote = await rest.selectAll('todos', 'select=id,text,done,due_date,owner,archived_at,source,sync_base')
  const byId = new Map(remote.map((r) => [r.id, r]))
  const inserts = []
  const updates = []
  let conflicts = 0
  let webOnly = 0
  for (const t of box.todos) {
    const m = mergeTodo(t, byId.get(t.id), now)
    conflicts += m.conflicts
    webOnly += m.webOnly
    if (m.action === 'insert') inserts.push(m.row)
    if (m.action === 'update') updates.push(m.row)
  }
  // Rows that came from the box but are no longer there: archive, never delete.
  const boxIds = new Set(box.todos.map((t) => t.id))
  const gone = remote.filter((r) => r.source === 'box' && !r.archived_at && !boxIds.has(r.id)).map((r) => r.id)
  if (!DRY) {
    if (inserts.length) await rest.insert('todos', inserts)
    if (updates.length) await rest.upsert('todos', updates)
    if (gone.length) await rest.archive('todos', gone, now)
  }
  return { box: box.todos.length, inserted: inserts.length, updated: updates.length, archived: gone.length, conflicts_box_won: conflicts, kept_web_changes: webOnly }
}

async function syncCalendar(rest, box, now, only) {
  const want = (id) => !only.length || only.includes(id)
  const sources = box.sources.filter((s) => want(s.id)).map(mapSource)
  const known = new Set(sources.map((s) => s.id))
  let skipped = 0
  let dateOnlyFixed = 0
  const events = []
  for (const e of box.events) {
    if (!known.has(e.source_id)) continue
    const row = mapEvent(e, now)
    if (!row) { skipped++; continue }
    if (row.all_day && Number(e.all_day) !== 1) dateOnlyFixed++
    events.push(row)
  }
  let archived = 0
  if (!DRY) {
    if (sources.length) await rest.upsert('calendar_sources', sources)
    if (events.length) await rest.upsert('calendar_events', events)
  }
  if (known.size) {
    const list = [...known].map((id) => `"${id.replace(/"/g, '')}"`).join(',')
    const remote = await rest.selectAll('calendar_events', `select=id&archived_at=is.null&source_id=in.(${encodeURIComponent(list)})`)
    const ids = new Set(events.map((e) => e.id))
    const gone = remote.map((r) => r.id).filter((id) => !ids.has(id))
    archived = gone.length
    if (!DRY && gone.length) await rest.archive('calendar_events', gone, now)
  }
  return {
    sources: sources.length,
    events: events.length,
    all_day: events.filter((e) => e.all_day).length,
    date_only_fixed: dateOnlyFixed,
    skipped_no_start: skipped,
    archived_missing: archived,
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const cfg = loadConfig()
  const box = await readBox(cfg.db)
  const now = new Date().toISOString()

  if (CHECK_DB) {
    // Offline: read the box and map everything, no network, no key needed.
    const mapped = box.events.map((e) => [e, mapEvent(e, now)])
    log('check-db', JSON.stringify({
      todos: box.todos.length,
      calendar_sources: box.sources.map((s) => s.id),
      events: box.events.length,
      mappable: mapped.filter(([, m]) => m).length,
      all_day: mapped.filter(([, m]) => m?.all_day).length,
      date_only_flagged_timed_on_box: mapped.filter(([e, m]) => m?.all_day && Number(e.all_day) !== 1).length,
    }))
    return
  }

  if (!/^https:\/\/[^/]+$/.test(cfg.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cfg.url)) {
    fail('SUPABASE_URL must look like https://<project>.supabase.co')
  }
  const problem = serviceKeyProblem(cfg.key)
  if (problem) fail(problem)

  const rest = restClient(cfg)
  const result = {}
  if (!ONLY || ONLY === 'todos') result.todos = await syncTodos(rest, box, now)
  if (!ONLY || ONLY === 'calendar') result.calendar = await syncCalendar(rest, box, now, cfg.sources)
  log(DRY ? 'dry run (nothing written)' : 'synced', JSON.stringify(result))
}

main().catch((e) => {
  console.error(`[${new Date().toISOString()}] sync failed: ${e.message}`)
  process.exit(1)
})
