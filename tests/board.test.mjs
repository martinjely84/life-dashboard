import test from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, addDays, fmtTime, isoWeek, daysBetween } from '../src/lib/tz.js'
import { buildMembers, eventsOn, eventMember, findClashes, parseDue, dedupeEvents } from '../src/lib/board.js'

test('Chicago date keys regardless of the machine timezone', () => {
  // 03:30 UTC on the 18th is 21:30 on the 17th in Chicago (CST, UTC−6).
  assert.equal(dateKey(new Date('2026-11-18T03:30:00Z')), '2026-11-17')
  assert.equal(fmtTime('2026-11-18T03:30:00Z'), '21:30')
  // Summer: CDT, UTC−5.
  assert.equal(fmtTime('2026-07-01T17:00:00Z'), '12:00')
  assert.equal(addDays('2026-03-07', 2), '2026-03-09') // across the DST change
  assert.equal(daysBetween('2026-11-17', '2026-11-24'), 7)
})

test('ISO weeks', () => {
  assert.equal(isoWeek('2026-11-17'), '2026-W47')
  assert.equal(isoWeek('2021-01-07'), '2021-W01') // a Thursday, 7th day of the year
  assert.equal(isoWeek('2021-01-03'), '2020-W53')
  assert.equal(isoWeek('2026-12-31'), '2026-W53')
})

const members = buildMembers([
  { id: 'p1', name: 'Alex Sample', color: '#3B82F6', sort_order: 0 },
  { id: 'p2', name: 'Robin', color: '#FBBF24', sort_order: 1, aliases: ['robbie'] },
])

test('all-day events sit on their date, not the evening before', () => {
  const ev = { id: 'a', source_id: 'family', summary: 'School holiday', all_day: true, start_date: '2026-11-20', end_date: '2026-11-21' }
  assert.equal(eventsOn([ev], '2026-11-19').length, 0)
  assert.equal(eventsOn([ev], '2026-11-20').length, 1)
  assert.equal(eventsOn([ev], '2026-11-21').length, 0)
})

test('timed events are placed by their Chicago date', () => {
  const late = { id: 'b', source_id: 'family', summary: 'Late', all_day: false, starts_at: '2026-11-21T05:30:00Z', ends_at: '2026-11-21T06:00:00Z' }
  assert.equal(eventsOn([late], '2026-11-20').length, 1)
  assert.equal(eventsOn([late], '2026-11-21').length, 0)
})

test('members from people rows, with aliases and Family fallback', () => {
  assert.equal(eventMember({ summary: 'Robbie: swim', source_id: 'work' }, members), 'p2')
  assert.equal(eventMember({ summary: 'Alex and Robin: dentist', source_id: 'work' }, members), 'family')
  assert.equal(eventMember({ summary: 'Dinner', source_id: 'family' }, members), 'family')
  assert.equal(eventMember({ summary: 'Standup', source_id: 'work' }, members), null)
})

test('clashes: same person, overlapping, different activities', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  const evs = [
    { id: '1', source_id: 'family', summary: 'Robin: practice', all_day: false, starts_at: '2026-11-19T23:00:00Z', ends_at: '2026-11-20T00:30:00Z' },
    { id: '2', source_id: 'family', summary: 'Robin: dentist', all_day: false, starts_at: '2026-11-20T00:00:00Z', ends_at: '2026-11-20T01:00:00Z' },
    { id: '3', source_id: 'family', summary: 'Alex: gym', all_day: false, starts_at: '2026-11-20T00:00:00Z', ends_at: '2026-11-20T01:00:00Z' },
  ]
  const c = findClashes(evs, members, now)
  assert.equal(c.length, 1)
  assert.equal(c[0].member, 'p2')
})

test('dedupe keeps one copy across feeds', () => {
  const a = { id: '1', source_id: 'work', uid: 'u', summary: 'Recital', all_day: false, starts_at: '2026-11-20T00:00:00Z' }
  const b = { ...a, id: '2', source_id: 'family' }
  const out = dedupeEvents([a, b])
  assert.deepEqual(out.map((e) => e.id), ['2'])
})

test('due dates read from action text', () => {
  assert.equal(parseDue('Send form by 3 Dec', '2026-11-17'), '2026-12-03')
  assert.equal(parseDue('Renew due Jan 5th', '2026-11-17'), '2027-01-05')
  assert.equal(parseDue('Deadline: 2026-11-30', '2026-11-17'), '2026-11-30')
  assert.equal(parseDue('No date here', '2026-11-17'), null)
})
