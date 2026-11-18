import test from 'node:test'
import assert from 'node:assert/strict'
import { mapEvent, mapSource, mergeTodo, parseEnv, serviceKeyProblem, redact } from '../scripts/sync-box/map.mjs'

test('date-only start is all-day even when the box flags it timed', () => {
  const e = mapEvent({ id: 'a', source_id: 'board', starts_at: '2026-11-20', ends_at: '2026-11-20', all_day: 0 })
  assert.equal(e.all_day, true)
  assert.equal(e.start_date, '2026-11-20')
  assert.equal(e.end_date, '2026-11-21') // exclusive, at least one day
  assert.equal(e.starts_at, null)
})

test('multi-day all-day keeps its exclusive end', () => {
  const e = mapEvent({ id: 'b', source_id: 'family', starts_at: '2026-11-25', ends_at: '2026-11-28', all_day: 1 })
  assert.deepEqual([e.start_date, e.end_date], ['2026-11-25', '2026-11-28'])
})

test('timed events keep their instants; bad or early ends fall back to the start', () => {
  const e = mapEvent({ id: 'c', source_id: 'work', starts_at: '2026-11-19T23:30:00Z', ends_at: '2026-11-20T00:30:00.000Z', all_day: 0 })
  assert.deepEqual([e.all_day, e.starts_at, e.ends_at], [false, '2026-11-19T23:30:00.000Z', '2026-11-20T00:30:00.000Z'])
  const f = mapEvent({ id: 'd', source_id: 'work', starts_at: '2026-11-19T23:30:00Z', ends_at: '2026-11-19T22:00:00Z', all_day: 0 })
  assert.equal(f.ends_at, f.starts_at)
  assert.equal(mapEvent({ id: 'e', source_id: 'work', starts_at: null }), null)
  assert.equal(mapEvent({ id: 'e', source_id: 'work', starts_at: '2026-11-19T23:30:00Z', status: 'weird' }).status, 'confirmed')
})

test('sources never carry the feed URL; errors are redacted', () => {
  const s = mapSource({ id: 'family', name: 'Family', ics_url: 'webcal://p01-caldav.icloud.com/secret', last_error: 'GET https://p01.icloud.com/published/2/abc failed' })
  assert.equal('ics_url' in s, false)
  assert.equal(s.last_error, 'GET [url] failed')
  assert.equal(redact(null), null)
})

const box = { id: 't1', text: 'Sample', done: 0, sort_order: 3, created_at: '2026-11-01T00:00:00.000Z', owner: 'martin', archived_at: null, due_date: '2026-11-20' }

test('new box to-do is inserted with a sync base', () => {
  const m = mergeTodo(box, undefined)
  assert.equal(m.action, 'insert')
  assert.equal(m.row.source, 'box')
  assert.deepEqual(m.row.sync_base, { text: 'Sample', done: false, due_date: '2026-11-20', owner: 'martin', archived_at: null })
})

test('a tick on the phone survives the next sync', () => {
  const base = mergeTodo(box, undefined).row.sync_base
  const remote = { id: 't1', text: 'Sample', done: true, due_date: '2026-11-20', owner: 'martin', archived_at: null, source: 'box', sync_base: base }
  const m = mergeTodo(box, remote)
  assert.equal(m.action, 'none')
  assert.equal(m.webOnly, 1)
})

test('a change on the box is applied, web-only changes kept', () => {
  const base = mergeTodo(box, undefined).row.sync_base
  const remote = { id: 't1', text: 'Sample', done: true, due_date: '2026-11-20', owner: 'martin', archived_at: null, source: 'box', sync_base: base }
  const m = mergeTodo({ ...box, text: 'Sample (edited on box)' }, remote)
  assert.equal(m.action, 'update')
  assert.equal(m.row.text, 'Sample (edited on box)')
  assert.equal(m.row.done, true) // the phone's tick is kept
  assert.equal(m.conflicts, 0)
})

test('both sides changed the same field: box wins, counted', () => {
  const base = mergeTodo(box, undefined).row.sync_base
  const remote = { id: 't1', text: 'Web text', done: false, due_date: '2026-11-20', owner: 'martin', archived_at: null, source: 'box', sync_base: base }
  const m = mergeTodo({ ...box, text: 'Box text' }, remote)
  assert.equal(m.row.text, 'Box text')
  assert.equal(m.conflicts, 1)
})

test('timestamp formats from Postgres compare equal to the box ones', () => {
  const b2 = { ...box, archived_at: '2026-11-10T10:00:00.000Z' }
  const base = mergeTodo(b2, undefined).row.sync_base
  const remote = { id: 't1', text: 'Sample', done: false, due_date: '2026-11-20', owner: 'martin', archived_at: '2026-11-10T10:00:00+00:00', source: 'box', sync_base: base }
  assert.equal(mergeTodo(b2, remote).action, 'none')
})

test('env parsing and key checks never need to print the key', () => {
  const env = parseEnv('# c\nSUPABASE_URL="https://x.supabase.co"\nexport SUPABASE_SERVICE_ROLE_KEY=sb_secret_abc\n')
  assert.equal(env.SUPABASE_URL, 'https://x.supabase.co')
  assert.equal(serviceKeyProblem(env.SUPABASE_SERVICE_ROLE_KEY), null)
  assert.match(serviceKeyProblem('sb_publishable_x'), /publishable/)
  const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`
  assert.equal(serviceKeyProblem(jwt('service_role')), null)
  assert.match(serviceKeyProblem(jwt('anon')), /anon/)
})
