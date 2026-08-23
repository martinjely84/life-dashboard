// One-time import of the old single-file app's localStorage blob ('mdc-v6')
// into the new nested folder model.
//
//   old domain-level goals  →  a root folder called "General"
//   old sub-folders         →  root-level folders under the same domain
//   old goals + actions     →  items of type goal, with type action children

import { DOMAINS } from './seed'

const LEGACY_KEY = 'mdc-v6'
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

export function detectLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.domains) return null

    let goals = 0
    Object.values(parsed.domains).forEach((d) => {
      goals += (d.goals || []).length
      ;(d.subfolders || []).forEach((sf) => { goals += (sf.goals || []).length })
    })
    return { raw: parsed, goals, pending: (parsed.pending || []).length }
  } catch {
    return null
  }
}

export function dismissLegacy() {
  try { localStorage.setItem('mld-legacy-dismissed', '1') } catch { /* ignore */ }
}

export function legacyDismissed() {
  try { return localStorage.getItem('mld-legacy-dismissed') === '1' } catch { return false }
}

// Turn one old goal (plus its actions) into item rows.
function goalRows(goal, folderId, order, items) {
  const row = {
    id: uid(), folder_id: folderId, type: 'goal', text: goal.text,
    done: !!goal.done, parent_item_id: null, sort_order: order,
    created_at: now(), updated_at: now(),
  }
  items.push(row)
  ;(goal.actions || []).forEach((a, i) => {
    items.push({
      id: uid(), folder_id: folderId, type: 'action', text: a.text,
      done: !!a.done, parent_item_id: row.id, sort_order: i,
      created_at: now(), updated_at: now(),
    })
  })
}

export function rowsFromLegacy(legacy) {
  const folders = []
  const items = []
  const chats = []

  const domains = DOMAINS.map((d, i) => ({
    id: d.id, name: d.name, emoji: d.emoji, color: d.color,
    score: legacy.domains?.[d.id]?.score ?? d.score ?? 5,
    sort_order: i,
  }))

  DOMAINS.forEach((def) => {
    const old = legacy.domains?.[def.id]
    if (!old) return
    let order = 0

    if ((old.goals || []).length) {
      const general = {
        id: uid(), domain_id: def.id, parent_folder_id: null, name: 'General',
        sort_order: order++, created_at: now(),
      }
      folders.push(general)
      old.goals.forEach((gl, i) => goalRows(gl, general.id, i, items))
    }

    ;(old.chats || []).forEach((c) => {
      chats.push({ id: uid(), domain_id: def.id, folder_id: null, person_id: null,
        title: c.title, url: c.url || null, meta: c.meta || null, created_at: now() })
    })

    ;(old.subfolders || []).forEach((sf) => {
      const folder = {
        id: uid(), domain_id: def.id, parent_folder_id: null, name: sf.name,
        sort_order: order++, created_at: now(),
      }
      folders.push(folder)
      ;(sf.goals || []).forEach((gl, i) => goalRows(gl, folder.id, i, items))
      ;(sf.chats || []).forEach((c) => {
        chats.push({ id: uid(), domain_id: def.id, folder_id: folder.id, person_id: null,
          title: c.title, url: c.url || null, meta: c.meta || null, created_at: now() })
      })
    })
  })

  ;(legacy.pending || []).forEach((c) => {
    chats.push({ id: uid(), domain_id: null, folder_id: null, person_id: null,
      title: c.title, url: c.url || null, meta: c.meta || null, created_at: now() })
  })

  Object.entries(legacy.people || {}).forEach(([pid, pdata]) => {
    if ((pdata.goals || []).length) {
      const folder = {
        id: uid(), domain_id: 'family', parent_folder_id: null,
        name: `__person__${pid}`, sort_order: 100, created_at: now(),
      }
      folders.push(folder)
      pdata.goals.forEach((gl, i) => goalRows(gl, folder.id, i, items))
    }
    ;(pdata.chats || []).forEach((c) => {
      chats.push({ id: uid(), domain_id: null, folder_id: null, person_id: pid,
        title: c.title, url: c.url || null, meta: c.meta || null, created_at: now() })
    })
  })

  return { domains, folders, items, chats }
}
