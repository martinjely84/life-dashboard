// Dates and times for the family board, always in America/Chicago — the
// family's home — whatever timezone the phone, laptop or TV is set to.
//
// Calendar dates are 'YYYY-MM-DD' strings ("keys") and are never turned
// into instants: new Date('2026-11-20') is midnight UTC, which is 6 PM on
// the 19th in Chicago. That is the bug the box board had with all-day
// events. Key arithmetic below works on UTC noon, which no DST change or
// timezone offset can push onto another day.

export const TZ = 'America/Chicago'

const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Chicago calendar date of an instant (Date, ISO string or ms). */
export const dateKey = (at = new Date()) => keyFmt.format(at instanceof Date ? at : new Date(at))

const noon = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function addDays(key, n) {
  const t = noon(key)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Whole days from key a to key b (b − a). */
export const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 864e5)

/** Format a date key: fmtKey('2026-11-20', { weekday: 'short' }) → 'Fri'. */
export const fmtKey = (key, opts) => noon(key).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })

/** '17:30' in Chicago. */
export const fmtTime = (at) => new Date(at).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** '5:30pm' / '6pm' in Chicago — the clash banner's short form. */
export const fmtTimeShort = (at) => new Date(at)
  .toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  .replace(':00', '').replace(' ', '').toLowerCase()

/** Format an instant as a Chicago date: fmtDate(now, { weekday: 'long' }). */
export const fmtDate = (at, opts) => new Date(at).toLocaleDateString('en-GB', { timeZone: TZ, ...opts })

/** ISO week of a date key, e.g. '2026-W47'. */
export function isoWeek(key) {
  const t = noon(key)
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)) // the Thursday of this week
  const year = t.getUTCFullYear()
  const week = Math.floor(Math.floor((t - Date.UTC(year, 0, 1)) / 864e5) / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}
