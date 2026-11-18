// Pure mapping/merge logic for the box → Supabase sync (no I/O), so it can
// be unit-tested with `npm test`. See sync.mjs for the runner.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = new Set(['confirmed', 'tentative', 'cancelled'])

const isDate = (v) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

function addDays(key, n) {
  const t = new Date(`${key}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** ISO instant string, or null for empty/unparseable values. */
export function iso(v) {
  if (v === null || v === undefined || v === '') return null
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** Feed URLs (which carry private tokens) out of error text. */
export const redact = (s) => (s == null ? null : String(s)
  .replace(/\b(?:https?|webcals?):\/\/\S+/gi, '[url]')
  .slice(0, 500))

// ── Calendar ─────────────────────────────────────────────────────────

/**
 * A box calendar_events row → a Supabase calendar_events row, or null if it
 * has no start. A date-only start ('2026-11-20') is ALWAYS all-day, whatever
 * the box's all_day flag says — the box had rows flagged timed with a bare
 * date, which browsers read as midnight UTC = 6 PM the day before in Chicago.
 */
export function mapEvent(r, syncedAt = new Date().toISOString()) {
  if (!r?.starts_at) return null
  const dateOnly = isDate(r.starts_at)
  const allDay = dateOnly || Number(r.all_day) === 1
  const out = {
    id: String(r.id),
    source_id: String(r.source_id),
    uid: r.uid ?? null,
    recurrence_id: r.recurrence_id ?? '',
    summary: r.summary ?? null,
    location: r.location ?? null,
    all_day: allDay,
    starts_at: null,
    ends_at: null,
    start_date: null,
    end_date: null,
    status: STATUSES.has(r.status) ? r.status : 'confirmed',
    archived_at: iso(r.archived_at),
    synced_at: syncedAt,
  }
  if (allDay) {
    // The box's own UI reads the first 10 characters of an all-day value.
    const start = String(r.starts_at).slice(0, 10)
    if (!isDate(start)) return null
    const endRaw = r.ends_at ? String(r.ends_at).slice(0, 10) : null
    out.start_date = start
    out.end_date = isDate(endRaw) && endRaw > start ? endRaw : addDays(start, 1) // end is exclusive
    return out
  }
  out.starts_at = iso(r.starts_at)
  if (!out.starts_at) return null
  const end = isDate(r.ends_at) ? null : iso(r.ends_at)
  out.ends_at = end && end >= out.starts_at ? end : out.starts_at
  return out
}

/** Box calendar_sources row → Supabase row. Never the ICS URL. */
export const mapSource = (r) => ({
  id: String(r.id),
  name: r.name || String(r.id),
  last_synced_at: iso(r.last_synced_at),
  last_status: r.last_status ?? null,
  last_error: redact(r.last_error),
  archived_at: iso(r.archived_at),
})

// ── To-dos ───────────────────────────────────────────────────────────

export const TODO_FIELDS = ['text', 'done', 'due_date', 'owner', 'archived_at']

/** The synced fields of a box to-do, normalised. */
export const boxTodoFields = (r) => ({
  text: String(r.text ?? ''),
  done: Number(r.done) === 1 || r.done === true,
  due_date: isDate(r.due_date) ? r.due_date : null,
  owner: r.owner || null,
  archived_at: iso(r.archived_at),
})

const norm = (f, v) => {
  if (v === undefined || v === null || v === '') return f === 'done' ? false : null
  if (f === 'archived_at') return iso(v)
  if (f === 'done') return Boolean(v)
  if (f === 'due_date') return String(v).slice(0, 10)
  return v
}
const same = (f, a, b) => norm(f, a) === norm(f, b)

/**
 * Three-way merge of one box to-do into Supabase.
 *   remote  — the Supabase row (or undefined if it isn't there yet)
 *   base    — remote.sync_base: what the box looked like at the last sync
 * A field the box changed since the last sync takes the box value; a field
 * only changed on the web (e.g. ticked on the phone) is left alone. If
 * both changed it, the box wins (counted as a conflict).
 * Returns { action: 'insert'|'update'|'none', row, conflicts, webOnly }.
 */
export function mergeTodo(box, remote, now = new Date().toISOString()) {
  const b = boxTodoFields(box)
  if (!remote) {
    return {
      action: 'insert',
      row: {
        id: box.id, ...b,
        sort_order: Number(box.sort_order) || 0,
        created_at: iso(box.created_at) || now,
        source: 'box', sync_base: b, updated_by: 'box-sync',
      },
      conflicts: 0,
      webOnly: 0,
    }
  }
  const base = remote.sync_base && typeof remote.sync_base === 'object' ? remote.sync_base : null
  const merged = {}
  let changed = false
  let conflicts = 0
  let webOnly = 0
  for (const f of TODO_FIELDS) {
    const boxMoved = !base || !same(f, b[f], base[f])
    const webMoved = !!base && !same(f, remote[f], base[f])
    merged[f] = norm(f, remote[f])
    if (boxMoved && !same(f, b[f], remote[f])) {
      merged[f] = b[f]
      changed = true
      if (webMoved) conflicts++
    } else if (!boxMoved && webMoved) {
      webOnly++
    }
  }
  const baseMoved = !base || TODO_FIELDS.some((f) => !same(f, b[f], base[f])) || remote.source !== 'box'
  if (!changed && !baseMoved) return { action: 'none', row: null, conflicts, webOnly }
  return {
    action: 'update',
    row: { id: remote.id, ...merged, source: 'box', sync_base: b, updated_by: 'box-sync' },
    conflicts,
    webOnly,
  }
}

// ── Env file ─────────────────────────────────────────────────────────

/** KEY=value lines; # comments; optional quotes. Values are never logged. */
export function parseEnv(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/** Why a key can't be the service-role key, or null if it looks right. */
export function serviceKeyProblem(key) {
  if (!key) return 'SUPABASE_SERVICE_ROLE_KEY is missing'
  if (key.startsWith('sb_publishable_')) return 'that is the publishable key; the sync needs the secret (service-role) key'
  if (key.startsWith('sb_secret_')) return null
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
      return payload.role === 'service_role' ? null : `that JWT has role "${payload.role}", not service_role`
    } catch { return 'SUPABASE_SERVICE_ROLE_KEY is not a readable JWT' }
  }
  return 'SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase secret key'
}
