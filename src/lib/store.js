// In-memory mirror of the whole tree (a few hundred rows at most), with
// optimistic local mutation and write-through to whichever backend is active.
// Components read it via useStore() and never touch the backend directly.

import { useSyncExternalStore } from 'react'
import { backend, hasSupabase } from './backend'
import { DOMAINS, PEOPLE, PERSON_GOALS } from './seed'

const uid = () => crypto.randomUUID()

let state = {
  domains: [], folders: [], items: [], people: [], todos: [], habits: [],
  status: 'loading', // loading | ready | error
  error: null,
}

const listeners = new Set()
const emit = () => { state = { ...state }; listeners.forEach((fn) => fn()) }

export function useStore() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => state,
  )
}

export const backendKind = backend.kind
export const isCloud = hasSupabase

// ── LOAD / SEED ──────────────────────────────────────────────────────
// StrictMode fires the mount effect twice, and two concurrent inits would
// both find an empty database and both seed it. One promise, shared.
let initPromise = null

export function init() {
  if (!initPromise) initPromise = runInit()
  return initPromise
}

async function runInit() {
  try {
    let data = await backend.load()
    if (!data.domains?.length) {
      await seedEverything()
      data = await backend.load()
    }
    Object.assign(state, data, { status: 'ready', error: null })
    emit()
    backend.subscribe(refresh)
  } catch (e) {
    state.status = 'error'
    state.error = e.message
    emit()
  }
}

export async function refresh() {
  try {
    const data = await backend.load()
    Object.assign(state, data)
    emit()
  } catch (e) {
    console.warn('refresh failed', e)
  }
}

function rowsFromSeed() {
  const folders = []
  const items = []

  const walkFolder = (spec, domainId, parentId, order) => {
    const folder = {
      id: uid(), domain_id: domainId, parent_folder_id: parentId,
      name: spec.name, sort_order: order, created_at: new Date().toISOString(),
    }
    folders.push(folder)
    ;(spec.items || []).forEach((it, i) => {
      const row = {
        id: uid(), folder_id: folder.id, type: it.type, text: it.text,
        done: false, parent_item_id: null, sort_order: i,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      items.push(row)
      ;(it.actions || []).forEach((a, ai) => {
        items.push({
          id: uid(), folder_id: folder.id, type: 'action', text: a,
          done: false, parent_item_id: row.id, sort_order: ai,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
      })
    })
    ;(spec.children || []).forEach((child, i) => walkFolder(child, domainId, folder.id, i))
    return folder
  }

  const domains = DOMAINS.map((d, i) => ({
    id: d.id, name: d.name, emoji: d.emoji, color: d.color,
    score: d.score ?? 5, sort_order: i,
  }))

  DOMAINS.forEach((d) => {
    d.folders.forEach((f, i) => walkFolder(f, d.id, null, i))
  })

  // People get a hidden per-person folder so their goals reuse the item model.
  const people = PEOPLE.map((p) => ({ ...p }))
  Object.entries(PERSON_GOALS).forEach(([pid, goals]) => {
    if (!goals.length) return
    const folder = {
      id: uid(), domain_id: 'family', parent_folder_id: null,
      name: `__person__${pid}`, sort_order: 100, created_at: new Date().toISOString(),
    }
    folders.push(folder)
    goals.forEach((gl, i) => {
      const row = {
        id: uid(), folder_id: folder.id, type: 'goal', text: gl.text, done: false,
        parent_item_id: null, sort_order: i,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      items.push(row)
      ;(gl.actions || []).forEach((a, ai) => {
        items.push({ id: uid(), folder_id: folder.id, type: 'action', text: a, done: false,
          parent_item_id: row.id, sort_order: ai,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      })
    })
  })

  return { domains, folders, items, people }
}

async function seedEverything() {
  await writeRows(rowsFromSeed())
}

// Insert in dependency order; items go parents-first so the FK holds.
export async function writeRows({ domains, people, folders, items }) {
  if (domains?.length) await backend.insert('domains', domains)
  if (people?.length) await backend.insert('people', people)
  if (folders?.length) {
    // Parents before children, at any depth, so the self-referencing FK holds.
    const done = new Set()
    const queue = [...folders]
    const ordered = []
    let guard = 0
    while (queue.length && guard++ < 10000) {
      const f = queue.shift()
      if (!f.parent_folder_id || done.has(f.parent_folder_id)) {
        ordered.push(f); done.add(f.id)
      } else queue.push(f)
    }
    await backend.insert('folders', ordered.concat(queue))
  }
  if (items?.length) {
    const parents = items.filter((i) => !i.parent_item_id)
    const children = items.filter((i) => i.parent_item_id)
    if (parents.length) await backend.insert('items', parents)
    if (children.length) await backend.insert('items', children)
  }
}

// ── SELECTORS ────────────────────────────────────────────────────────
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

export const isPersonFolder = (f) => f.name.startsWith('__person__')

export const domainsSorted = (s) => [...s.domains].sort(bySort)

export const childFolders = (s, domainId, parentId) =>
  s.folders
    .filter((f) => f.domain_id === domainId && f.parent_folder_id === (parentId ?? null) && !isPersonFolder(f))
    .sort(bySort)

export const folderById = (s, id) => s.folders.find((f) => f.id === id)

export const folderItems = (s, folderId) =>
  s.items.filter((i) => i.folder_id === folderId && !i.parent_item_id).sort(bySort)

export const actionsOf = (s, goalId) =>
  s.items.filter((i) => i.parent_item_id === goalId).sort(bySort)

export function folderPath(s, folderId) {
  const path = []
  let f = folderById(s, folderId)
  let guard = 0
  while (f && guard++ < 100) {
    path.unshift(f)
    f = f.parent_folder_id ? folderById(s, f.parent_folder_id) : null
  }
  return path
}

// Every folder id at or beneath `folderId`.
export function descendantFolderIds(s, folderId) {
  const out = [folderId]
  const walk = (id) => {
    s.folders.filter((f) => f.parent_folder_id === id).forEach((f) => { out.push(f.id); walk(f.id) })
  }
  walk(folderId)
  return out
}

// Open-item counts rolled up through the subtree — what the tree nodes show.
export function folderCounts(s, folderId) {
  const ids = new Set(descendantFolderIds(s, folderId))
  let open = 0, total = 0, actions = 0
  s.items.forEach((i) => {
    if (!ids.has(i.folder_id)) return
    if (i.type === 'action') { if (!i.done) actions++; return }
    total++
    if (!i.done) open++
  })
  return { open, total, actions }
}

export function domainCounts(s, domainId) {
  const folderIds = new Set(s.folders.filter((f) => f.domain_id === domainId).map((f) => f.id))
  let goals = 0, actions = 0
  s.items.forEach((i) => {
    if (!folderIds.has(i.folder_id) || i.done) return
    if (i.type === 'action') actions++
    else goals++
  })
  return { goals, actions }
}

export function firstOpenGoal(s, domainId) {
  const folderIds = new Set(
    s.folders.filter((f) => f.domain_id === domainId && !isPersonFolder(f)).map((f) => f.id),
  )
  const hit = s.items.find((i) => folderIds.has(i.folder_id) && i.type !== 'action' && !i.done)
  return hit?.text || ''
}

export function personFolderId(s, personId) {
  return s.folders.find((f) => f.name === `__person__${personId}`)?.id || null
}

// Flat cross-domain view used by the Lists screen.
export function allItems(s, type) {
  return s.items
    .filter((i) => (type ? i.type === type : true))
    .map((i) => {
      const folder = folderById(s, i.folder_id)
      const domain = s.domains.find((d) => d.id === folder?.domain_id)
      const path = folder ? folderPath(s, folder.id).map((f) => f.name) : []
      const parent = i.parent_item_id ? s.items.find((x) => x.id === i.parent_item_id) : null
      // Items in a person folder belong to a Family person panel, not to a
      // folder you can navigate to — the list links there instead.
      const personId = folder && isPersonFolder(folder)
        ? folder.name.replace('__person__', '')
        : null
      const person = personId ? s.people.find((p) => p.id === personId) : null

      return {
        ...i,
        domainName: domain?.name || '—',
        domainId: domain?.id || null,
        domainColor: domain?.color || '#7a7a8a',
        folderId: i.folder_id,
        personId,
        folderPath: personId
          ? `Person: ${person?.name || personId}`
          : path.join(' › '),
        parentText: parent?.text || null,
      }
    })
}

// ── TO-DO LIST ───────────────────────────────────────────────────────
export const todosSorted = (s) => [...(s.todos || [])].sort(bySort)

export function addTodo(text) {
  const row = {
    id: uid(), text, done: false,
    sort_order: (state.todos || []).length, created_at: new Date().toISOString(),
  }
  state.todos = [...(state.todos || []), row]
  emit()
  persist(() => backend.insert('todos', [row]))
}

export function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id)
  if (!t) return
  const done = !t.done
  state.todos = state.todos.map((x) => (x.id === id ? { ...x, done } : x))
  emit()
  persist(() => backend.update('todos', id, { done }))
}

export function updateTodo(id, text) {
  state.todos = state.todos.map((x) => (x.id === id ? { ...x, text } : x))
  emit()
  persist(() => backend.update('todos', id, { text }))
}

export function deleteTodo(id) {
  state.todos = state.todos.filter((x) => x.id !== id)
  emit()
  persist(() => backend.remove('todos', id))
}

export function clearDoneTodos() {
  const doomed = state.todos.filter((t) => t.done)
  state.todos = state.todos.filter((t) => !t.done)
  emit()
  persist(() => removeAll(doomed.map((t) => ['todos', t.id])))
}

// ── HABITS: DAILY, WEEKLY, MONTHLY ───────────────────────────────────
// A habit is "done" only if it was last ticked inside the current period,
// so its checkbox clears itself when a new day, week or month starts. The
// streak counts consecutive periods and is what carries over.

export const CADENCES = {
  daily:   { label: 'Daily',   unit: 'day' },
  weekly:  { label: 'Weekly',  unit: 'week' },
  monthly: { label: 'Monthly', unit: 'month' },
}

const pad = (n) => String(n).padStart(2, '0')
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// A label identifying which period a date falls in. Weeks are named by the
// Monday that starts them, so the comparison is a plain string equality.
function periodKey(date, cadence) {
  if (cadence === 'monthly') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  if (cadence === 'weekly') {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
    return `W${fmtDate(d)}`
  }
  return fmtDate(date)
}

function previousPeriodDate(cadence, from = new Date()) {
  const d = new Date(from)
  if (cadence === 'monthly') d.setMonth(d.getMonth() - 1)
  else if (cadence === 'weekly') d.setDate(d.getDate() - 7)
  else d.setDate(d.getDate() - 1)
  return d
}

export const todayKey = () => fmtDate(new Date())

export const habitsSorted = (s, cadence) =>
  [...(s.habits || [])]
    .filter((h) => (cadence ? (h.cadence || 'daily') === cadence : true))
    .sort(bySort)

// Kept the old name so callers read naturally; it means "done this period".
export function habitDoneToday(h) {
  if (!h.last_done) return false
  const cadence = h.cadence || 'daily'
  return periodKey(parseDate(h.last_done), cadence) === periodKey(new Date(), cadence)
}

export function addHabit(text, cadence = 'daily') {
  const row = {
    id: uid(), text, cadence, last_done: null, streak: 0,
    sort_order: (state.habits || []).filter((h) => (h.cadence || 'daily') === cadence).length,
    created_at: new Date().toISOString(),
  }
  state.habits = [...(state.habits || []), row]
  emit()
  persist(() => backend.insert('habits', [row]))
}

export function toggleHabit(id) {
  const h = state.habits.find((x) => x.id === id)
  if (!h) return
  const cadence = h.cadence || 'daily'
  const prev = previousPeriodDate(cadence)

  let patch
  if (habitDoneToday(h)) {
    // Unticking: step the streak back, and hand "last done" to the previous
    // period if the streak survives, so the chain stays intact.
    const streak = Math.max(0, (h.streak || 0) - 1)
    patch = { last_done: streak > 0 ? fmtDate(prev) : null, streak }
  } else {
    // Ticking straight after the previous period extends the chain; any
    // longer gap starts a new one.
    const continues = h.last_done
      && periodKey(parseDate(h.last_done), cadence) === periodKey(prev, cadence)
    patch = { last_done: todayKey(), streak: continues ? (h.streak || 0) + 1 : 1 }
  }

  state.habits = state.habits.map((x) => (x.id === id ? { ...x, ...patch } : x))
  emit()
  persist(() => backend.update('habits', id, patch))
}

export function updateHabit(id, text) {
  state.habits = state.habits.map((x) => (x.id === id ? { ...x, text } : x))
  emit()
  persist(() => backend.update('habits', id, { text }))
}

export function deleteHabit(id) {
  state.habits = state.habits.filter((x) => x.id !== id)
  emit()
  persist(() => backend.remove('habits', id))
}

// ── MUTATIONS ────────────────────────────────────────────────────────
// Each one updates memory first (instant UI), then persists. A failed write
// reloads from the backend so the screen never lies about what was saved.
async function persist(fn) {
  try { await fn() } catch (e) { console.error(e); await refresh() }
}

export function setScore(domainId, score) {
  const clamped = Math.max(1, Math.min(10, score))
  state.domains = state.domains.map((d) => (d.id === domainId ? { ...d, score: clamped } : d))
  emit()
  persist(() => backend.update('domains', domainId, { score: clamped }))
}

// Reads the live value rather than a render snapshot, so clicking − / + faster
// than React re-renders still counts every press.
export function adjustScore(domainId, delta) {
  const current = state.domains.find((d) => d.id === domainId)?.score ?? 5
  setScore(domainId, current + delta)
}

// Domain ids are readable slugs, like the seeded ones ('health', 'career').
// A clash just gets a numeric suffix.
function uniqueDomainId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'domain'
  if (!state.domains.some((d) => d.id === base)) return base
  let n = 2
  while (state.domains.some((d) => d.id === `${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function addDomain({ name, emoji, color }) {
  const row = {
    id: uniqueDomainId(name),
    name,
    emoji: emoji || '\u{1F4C1}',
    color: color || '#c8a96e',
    score: 5,
    sort_order: state.domains.length,
  }
  state.domains = [...state.domains, row]
  emit()
  persist(() => backend.insert('domains', [row]))
  return row.id
}

export function updateDomain(id, patch) {
  state.domains = state.domains.map((d) => (d.id === id ? { ...d, ...patch } : d))
  emit()
  persist(() => backend.update('domains', id, patch))
}

// What a domain delete takes with it — shown in the confirmation.
export function domainDeleteImpact(s, domainId) {
  const folderIds = new Set(s.folders.filter((f) => f.domain_id === domainId).map((f) => f.id))
  const items = s.items.filter((i) => folderIds.has(i.folder_id))
  return {
    folders: folderIds.size,
    items: items.filter((i) => i.type !== 'action').length,
    actions: items.filter((i) => i.type === 'action').length,
  }
}

// Postgres cascades on its own, but the localStorage backend has no foreign
// keys — so every affected row is deleted explicitly. On Supabase the extra
// deletes are harmless no-ops against rows the cascade already removed.
async function removeAll(pairs) {
  for (const [table, id] of pairs) {
    await backend.remove(table, id).catch(() => {})
  }
}

export function deleteDomain(id) {
  const folderIds = new Set(state.folders.filter((f) => f.domain_id === id).map((f) => f.id))
  const doomedItems = state.items.filter((i) => folderIds.has(i.folder_id))

  state.domains = state.domains.filter((d) => d.id !== id)
  state.folders = state.folders.filter((f) => f.domain_id !== id)
  state.items = state.items.filter((i) => !folderIds.has(i.folder_id))
  emit()

  persist(() => removeAll([
    ...doomedItems.map((i) => ['items', i.id]),
    ...[...folderIds].map((f) => ['folders', f]),
    ['domains', id],
  ]))
}

export function addFolder(domainId, parentId, name) {
  const siblings = childFolders(state, domainId, parentId)
  const row = {
    id: uid(), domain_id: domainId, parent_folder_id: parentId ?? null, name,
    sort_order: siblings.length, created_at: new Date().toISOString(),
  }
  state.folders = [...state.folders, row]
  emit()
  persist(() => backend.insert('folders', [row]))
  return row.id
}

export function renameFolder(id, name) {
  state.folders = state.folders.map((f) => (f.id === id ? { ...f, name } : f))
  emit()
  persist(() => backend.update('folders', id, { name }))
}

export function deleteFolder(id) {
  const idSet = new Set(descendantFolderIds(state, id))
  const doomedItems = state.items.filter((i) => idSet.has(i.folder_id))

  state.folders = state.folders.filter((f) => !idSet.has(f.id))
  state.items = state.items.filter((i) => !idSet.has(i.folder_id))
  emit()

  persist(() => removeAll([
    ...doomedItems.map((i) => ['items', i.id]),
    ...[...idSet].map((f) => ['folders', f]),
  ]))
}

export function addItem(folderId, type, text) {
  const siblings = folderItems(state, folderId)
  const row = {
    id: uid(), folder_id: folderId, type, text, done: false, parent_item_id: null,
    sort_order: siblings.length,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  state.items = [...state.items, row]
  emit()
  persist(() => backend.insert('items', [row]))
  return row.id
}

export function addAction(goalId, text) {
  const goal = state.items.find((i) => i.id === goalId)
  if (!goal) return
  const siblings = actionsOf(state, goalId)
  const row = {
    id: uid(), folder_id: goal.folder_id, type: 'action', text, done: false,
    parent_item_id: goalId, sort_order: siblings.length,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  state.items = [...state.items, row]
  emit()
  persist(() => backend.insert('items', [row]))
}

export function toggleItem(id) {
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  const done = !item.done
  state.items = state.items.map((i) => (i.id === id ? { ...i, done } : i))
  emit()
  persist(() => backend.update('items', id, { done }))
}

export function updateItemText(id, text) {
  state.items = state.items.map((i) => (i.id === id ? { ...i, text } : i))
  emit()
  persist(() => backend.update('items', id, { text }))
}

export function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id && i.parent_item_id !== id)
  emit()
  persist(() => backend.remove('items', id))
}

// Wipe every folder and item, then write a fresh set — used by the
// one-time import from the old localStorage dashboard. Domains and people
// keep their ids; scores are carried over from the incoming rows.
export async function replaceAllWith({ domains, folders, items }) {
  try {
    // Removing root folders cascades to their descendants and items.
    const roots = state.folders.filter((f) => !f.parent_folder_id)
    for (const f of roots) await backend.remove('folders', f.id)
    for (const f of state.folders.filter((x) => x.parent_folder_id)) {
      await backend.remove('folders', f.id).catch(() => {})
    }
    for (const i of state.items) await backend.remove('items', i.id).catch(() => {})

    if (domains?.length) {
      for (const d of domains) await backend.update('domains', d.id, { score: d.score })
    }
    await writeRows({ folders, items })
    await refresh()
  } catch (e) {
    console.error('import failed', e)
    state.status = 'error'
    state.error = `Import failed: ${e.message}`
    emit()
  }
}

// Person goals live in a hidden folder created on demand.
export function ensurePersonFolder(personId) {
  const existing = personFolderId(state, personId)
  if (existing) return existing
  return addFolder('family', null, `__person__${personId}`)
}
