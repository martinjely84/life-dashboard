import { useEffect, useState } from 'react'
import { MEAL_PLAN } from '../lib/meals'

// Family domain colour, so the planner reads as part of Family.
const ACCENT = '#b088f9'
const ELSIE = '#4ecdc4'

// Grocery ticks are per-week UI state, kept in this browser only — the
// database schema is untouched. A new `week` in meals.js starts a fresh list.
const storageKey = `mld-meals-${MEAL_PLAN.week}`
const itemKey = (cat, item) => `${cat}::${item.name}`

function loadChecked() {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* corrupt or unavailable — start empty */ }
  return new Set()
}

function useChecked() {
  const [checked, setChecked] = useState(loadChecked)

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify([...checked])) } catch { /* ignore */ }
  }, [checked])

  // Keep other tabs in step, like the local backend does.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === storageKey) setChecked(loadChecked()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = (key) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const clear = () => setChecked(new Set())
  return { checked, toggle, clear }
}

const todayShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'short' })

function WeekPlan() {
  const today = todayShort()
  return (
    <div className="panel">
      <div className="sl">Dinner plan · week {MEAL_PLAN.week.split('-W')[1]}</div>
      <div className="meal-grid">
        {MEAL_PLAN.dinners.map((d) => (
          <div key={d.day} className={`meal-card${d.day === today ? ' today' : ''}`}
            style={d.day === today ? { borderColor: ACCENT } : undefined}>
            <div className="meal-hd">
              <span className="meal-day" style={{ color: ACCENT }}>{d.day}</span>
              {d.day === today && <span className="meal-tag" style={{ background: `${ACCENT}22`, color: ACCENT }}>tonight</span>}
            </div>
            <div className="meal-main">{d.main}</div>
            {d.everyone ? (
              <div className="meal-row">
                <span className="meal-who" style={{ color: 'var(--acc)' }}>Everyone</span>
                <span className="meal-txt">{d.everyone}</span>
              </div>
            ) : (
              <>
                <div className="meal-row">
                  <span className="meal-who" style={{ color: ELSIE }}>Elsie</span>
                  <span className="meal-txt">{d.elsie}</span>
                </div>
                <div className="meal-row">
                  <span className="meal-who" style={{ color: ACCENT }}>Family</span>
                  <span className="meal-txt">{d.family}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SafeFoods() {
  return (
    <div className="panel today-col">
      <div className="sl" style={{ marginBottom: '.75rem' }}>Elsie&apos;s safe foods</div>
      <div className="meal-safe">
        {MEAL_PLAN.safeFoods.map((f) => (
          <span key={f} className="meal-chip" style={{ background: `${ELSIE}1f`, color: ELSIE, borderColor: `${ELSIE}55` }}>
            {f}
          </span>
        ))}
      </div>
      <div className="meal-hint">
        Every night has a plain version built from these. Edit the list in src/lib/meals.js.
      </div>
    </div>
  )
}

function Grocery() {
  const { checked, toggle, clear } = useChecked()
  const all = MEAL_PLAN.grocery.flatMap((g) => g.items.map((i) => itemKey(g.category, i)))
  const got = all.filter((k) => checked.has(k)).length

  return (
    <div className="panel today-col">
      <div className="sl" style={{ marginBottom: '.75rem' }}>
        Grocery list <span className="meal-count">{got}/{all.length}</span>
        {got > 0 && (
          <button className="btn-newsf" style={{ marginLeft: 'auto' }} onClick={clear}>
            untick all
          </button>
        )}
      </div>

      {MEAL_PLAN.grocery.map((g) => (
        <div key={g.category} className="meal-cat">
          <div className="meal-cat-nm">{g.category}</div>
          <div className="glist">
            {g.items.map((item) => {
              const key = itemKey(g.category, item)
              const done = checked.has(key)
              return (
                <div className="gi-wrap" key={key}>
                  <label className="gi meal-gi">
                    <button
                      className="gck"
                      style={done ? { background: '#c8a96e', borderColor: '#c8a96e', color: '#0d0f14' } : undefined}
                      onClick={() => toggle(key)}
                      aria-label={done ? `Untick ${item.name}` : `Tick ${item.name}`}
                    >
                      {done ? '✓' : ''}
                    </button>
                    <span className={`gtx${done ? ' dn' : ''}`}>
                      {item.name}
                      {item.note && <span className="meal-note"> · {item.note}</span>}
                    </span>
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MealPlanner() {
  return (
    <>
      <div className="panel">
        <div className="ph" style={{ marginBottom: 0 }}>
          <span className="ph-em">🍽️</span>
          <div className="ph-ti">Meal planner</div>
          <span className="meal-tag" style={{ background: `${ACCENT}22`, color: ACCENT }}>
            👪 Family · {MEAL_PLAN.household}
          </span>
        </div>
      </div>
      <WeekPlan />
      <div className="today-grid" style={{ alignItems: 'start' }}>
        <Grocery />
        <SafeFoods />
      </div>
    </>
  )
}
