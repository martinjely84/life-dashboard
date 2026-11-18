// A made-up family for the demo board: what /board and /tv show when no
// Supabase is configured, and what the screenshots in the docs use. Dates
// are relative to today (America/Chicago) so the demo always looks live.
// Never put real people or events in here — this repository is public.

import { dateKey, addDays, isoWeek, TZ } from './tz.js'

// Chicago wall-clock time on a date key → ISO instant.
function at(key, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const guess = Date.parse(`${key}T${hhmm}:00Z`)
  // Chicago is UTC−5 or −6; find the offset that round-trips.
  for (const off of [5, 6]) {
    const t = guess + off * 3600e3
    const d = new Date(t)
    const local = d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    if (dateKey(d) === key && local === `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`) return d.toISOString()
  }
  return new Date(guess + 6 * 3600e3).toISOString()
}

export function sampleBoard(now = new Date()) {
  const today = dateKey(now)
  const d = (n) => addDays(today, n)
  let n = 0
  const ev = (day, start, end, summary, source = 'family', extra = {}) => ({
    id: `ev${++n}`, uid: `sample-${n}`, source_id: source, source_name: source === 'work' ? 'Work' : 'Family',
    summary, location: null, status: 'confirmed',
    ...(start
      ? { all_day: false, starts_at: at(day, start), ends_at: at(day, end), start_date: null, end_date: null }
      : { all_day: true, starts_at: null, ends_at: null, start_date: day, end_date: end || addDays(day, 1) }),
    ...extra,
  })

  const people = [
    { id: 'alex', name: 'Alex', color: '#3B82F6', sort_order: 0, aliases: [] },
    { id: 'sam', name: 'Sam', color: '#F472B6', sort_order: 1, aliases: [] },
    { id: 'robin', name: 'Robin', color: '#2DD4BF', sort_order: 2, aliases: [] },
    { id: 'jordan', name: 'Jordan', color: '#FBBF24', sort_order: 3, aliases: ['jordy'] },
  ]

  const events = [
    ev(d(0), '08:00', '08:30', 'Alex: school run'),
    ev(d(0), '15:30', '16:30', 'Robin: piano lesson'),
    ev(d(0), '17:30', '19:00', 'Jordan: swim practice'),
    ev(d(2), '18:00', '18:45', 'Jordan: dentist check-up'),
    ev(d(1), null, null, 'Robin: school picture day'),
    ev(d(1), '09:00', '10:00', 'Quarterly planning', 'work'),
    ev(d(1), '16:00', '17:00', 'Robin: art club'),
    ev(d(2), '17:30', '18:30', 'Jordan: swim practice'),
    ev(d(2), '19:00', '21:00', 'Sam: book club'),
    ev(d(3), null, addDays(d(3), 2), 'Jordan: school camp'),
    ev(d(3), '18:00', '20:00', 'Pizza and film night'),
    ev(d(4), '10:00', '12:00', 'Robin: birthday party (Oak Park)'),
    ev(d(5), '08:00', '09:00', 'Alex: 5k run'),
    ev(d(5), '13:00', '14:00', 'Grandparents video call'),
    ev(d(6), '17:30', '18:30', 'Jordan: swim practice'),
    ev(d(6), '19:30', '20:30', 'School PTA meeting'),
  ]

  const domains = [
    { id: 'health', name: 'Health & Fitness', emoji: '💪', color: '#34D399', sort_order: 0 },
    { id: 'family', name: 'Family', emoji: '🏡', color: '#A78BFA', sort_order: 1 },
    { id: 'home', name: 'Home', emoji: '🔧', color: '#F59E0B', sort_order: 2 },
  ]
  const folders = [
    { id: 'f-health', domain_id: 'health', name: 'General' },
    { id: 'f-family', domain_id: 'family', name: 'General' },
    { id: 'f-home', domain_id: 'home', name: 'General' },
  ]
  const g = (id, folder, text, i) => ({ id, folder_id: folder, type: 'goal', text, done: false, parent_item_id: null, sort_order: i, created_at: '2026-01-01T00:00:00Z' })
  const a = (id, goal, folder, text, i, created = '2026-02-01T00:00:00Z') => ({ id, folder_id: folder, type: 'action', text, done: false, parent_item_id: goal, sort_order: i, created_at: created })
  const items = [
    g('g1', 'f-health', 'Run a 10k in the spring', 0),
    g('g2', 'f-health', 'Cook at home five nights a week', 1),
    g('g3', 'f-family', 'Plan a summer road trip', 0),
    g('g4', 'f-family', 'One-to-one time with each child every week', 1),
    g('g5', 'f-home', 'Finish the garden makeover', 0),
    g('g6', 'f-home', 'Declutter the garage', 1),
    a('a1', 'g1', 'f-health', `Sign up for the race by ${fmtShort(d(9))}`, 0),
    a('a2', 'g3', 'f-family', 'Shortlist three routes and campsites', 0),
    a('a3', 'g5', 'f-home', `Get quotes for the fence by ${fmtShort(d(-2))}`, 0),
    a('a4', 'g6', 'f-home', 'Book a charity pick-up', 0),
    a('a4a', 'a4', 'f-home', 'Sort boxes', 0),
    a('a5', 'g4', 'f-family', 'Put a weekly slot in the calendar', 0),
  ]

  const t = (id, text, due, i, extra = {}) => ({ id, text, done: false, due_date: due, sort_order: i, created_at: '2026-01-01T00:00:00Z', owner: null, ...extra })
  const todos = [
    t('t1', 'Robin: return library books', d(-1), 0),
    t('t2', 'Jordan: sign the camp consent form', d(0), 1),
    t('t3', 'Order a birthday present for the party', d(3), 2),
    t('t4', 'Book the car in for a service', null, 3),
    t('t5', 'Renew the home insurance', d(12), 4),
    t('t6', 'Sam: pick up dry cleaning', null, 5),
    t('t7', 'Buy new swim goggles for Jordan', null, 6),
  ]

  const week = isoWeek(today)
  return {
    people, domains, folders, items, todos, events,
    sources: [{ id: 'family', name: 'Family', last_status: 'ok' }, { id: 'work', name: 'Work', last_status: 'ok' }],
    review: {
      week,
      theme: 'Holiday planning',
      cards: [
        { id: 'c1', kind: 'win', text: 'Everyone made it to swim on time all week', done: false },
        { id: 'c2', kind: 'win', text: 'Garage half cleared', done: false },
        { id: 'c3', kind: 'decision', text: 'Which weekend for the road trip?', done: false },
        { id: 'c4', kind: 'parked', text: 'New bikes for the spring', done: false },
      ],
      session: { step: 3, started_at: new Date(now.getTime() - 130e3).toISOString(), paused_at: null, elapsed_before_pause_ms: 0 },
    },
  }
}

function fmtShort(key) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
}
