import { useEffect, useState } from 'react'
import { supabase } from '../../lib/backend'
import { REVIEW_STEPS, REVIEW_TOTAL_MIN, REVIEW_BUFFER_MIN, CARD_KINDS, reviewTimer, fmtClock } from '../../lib/board'

// Weekly review remote control (phone/laptop). The TV shows the review at
// /tv?mode=review; everything here writes to Supabase, and the TV picks it
// up within seconds. The timer runs on the database clock (review_control).

const RESET_CONFIRM_MS = 4000

function useTick(on) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!on) return undefined
    const t = setInterval(() => setN((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [on])
}

function Timer({ session, onAction, busy, offsetMs }) {
  const { step, status, elapsedMs } = reviewTimer(session, Date.now() + offsetMs)
  useTick(status === 'running')
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (!confirmReset) return undefined
    const t = setTimeout(() => setConfirmReset(false), RESET_CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirmReset])
  const info = REVIEW_STEPS[step - 1]
  const remaining = info.minutes * 60e3 - elapsedMs
  const over = remaining <= 0
  return (
    <section className={`panel fb-card fb-timer${over ? ' over' : ''}`}>
      <div className="sl fb-sl">Step {step} of {REVIEW_STEPS.length}<span className="pill">{{ idle: 'Ready', running: 'Running', paused: 'Paused' }[status]}</span></div>
      <div className="fb-tm-name">{info.name}</div>
      <div className="fb-tm-clock">{over ? `+${fmtClock(-remaining)}` : fmtClock(Math.ceil(remaining / 1000) * 1000)}</div>
      <div className="fb-tm-sub">{info.minutes} min step · agenda {REVIEW_TOTAL_MIN} min + {REVIEW_BUFFER_MIN} buffer</div>
      <ol className="fb-steps">
        {REVIEW_STEPS.map((s) => <li key={s.n} className={s.n < step ? 'done' : s.n === step ? 'on' : ''}>{s.name} <small>{s.minutes}m</small></li>)}
      </ol>
      <div className="fb-tm-ctl">
        <button className="btn-s" disabled={busy || step <= 1} onClick={() => onAction('back')}>Back</button>
        <button className="btn-p" disabled={busy} onClick={() => onAction(status === 'running' ? 'pause' : 'start')}>
          {status === 'running' ? 'Pause' : status === 'idle' ? 'Start' : 'Resume'}
        </button>
        <button className="btn-s" disabled={busy || step >= REVIEW_STEPS.length} onClick={() => onAction('next')}>Next</button>
        <button className={`btn-s${confirmReset ? ' danger' : ''}`} disabled={busy}
          onClick={() => { if (confirmReset) { setConfirmReset(false); onAction('reset') } else setConfirmReset(true) }}>
          {confirmReset ? 'Sure?' : 'Reset'}
        </button>
      </div>
    </section>
  )
}

function Theme({ week, theme, onSave, readOnly }) {
  const [draft, setDraft] = useState(null)
  const value = draft ?? theme
  const save = (e) => {
    e.preventDefault()
    if (draft !== null && draft.trim() !== theme) onSave(draft.trim())
    setDraft(null)
  }
  return (
    <form className="panel fb-card fb-theme" onSubmit={save}>
      <div className="sl fb-sl">Week {Number(week.split('-W')[1])} · theme</div>
      <div className="fb-add">
        <input value={value} placeholder="This week's theme…" aria-label="This week's theme" disabled={readOnly}
          onChange={(e) => setDraft(e.target.value)} enterKeyHint="done" autoComplete="off" />
        {!readOnly && <button type="submit" className="btn-g" disabled={draft === null || draft.trim() === theme}>Save</button>}
      </div>
    </form>
  )
}

function Cards({ kind, title, add, empty, cards, onAdd, onToggle, readOnly }) {
  const [text, setText] = useState('')
  const list = cards.filter((c) => c.kind === kind)
  const submit = (e) => {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    onAdd(kind, v)
    setText('')
  }
  return (
    <section className={`panel fb-card fb-cards k-${kind}`}>
      <div className="sl fb-sl">{title}<span className="pbadge">{list.length}</span></div>
      {!readOnly && (
        <form className="fb-add" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={add} aria-label={add} autoComplete="off" />
          <button type="submit" className="btn-g" disabled={!text.trim()}>Add</button>
        </form>
      )}
      {list.length ? (
        <div className="fb-todo-list">
          {[...list.filter((c) => !c.done), ...list.filter((c) => c.done)].map((c) => (
            <button key={c.id} className={`fb-todo${c.done ? ' done' : ''}`} onClick={() => !readOnly && onToggle(c)} disabled={readOnly}
              aria-pressed={c.done}>
              <span className={`gck${c.done ? ' on' : ''}`} aria-hidden="true">{c.done ? '✓' : ''}</span>
              <span className="fb-todo-tx">{c.text}</span>
            </button>
          ))}
        </div>
      ) : <div className="empty">{empty}</div>}
    </section>
  )
}

export default function ReviewPanel({ board }) {
  const review = board.data.review || { week: '', cards: [], session: null, theme: '' }
  const readOnly = !!board.demo || !supabase
  const [session, setSession] = useState(review.session)
  const [offsetMs, setOffsetMs] = useState(board.offsetMs || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { setSession(review.session) }, [review.session])

  const reload = () => board.actions?.reloadReview?.()
  const run = async (fn) => {
    setError(null)
    const { error: e } = await fn()
    if (e) setError(e.message)
    reload()
  }

  const onAction = async (action) => {
    if (readOnly) return
    setBusy(true)
    const sent = Date.now()
    const { data, error: e } = await supabase.rpc('review_control', { p_action: action })
    setBusy(false)
    if (e) { setError(e.message); return }
    setSession(data)
    setOffsetMs(Date.parse(data.server_now) - (sent + Date.now()) / 2)
  }

  return (
    <div className="fb-review">
      {readOnly && <div className="banner"><p>Demo: the review controls work once Supabase is connected.</p></div>}
      {error && <div className="err">{error}</div>}
      <p className="fb-hint">Put <a href="/tv?mode=review">/tv?mode=review</a> on the TV (add <code>?mode=review</code> to its screen link), then run the review from here.</p>
      <div className="fb-grid">
        <div className="fb-col">
          <Timer session={session} onAction={onAction} busy={busy || readOnly} offsetMs={offsetMs} />
          <Theme week={review.week} theme={review.theme || ''} readOnly={readOnly}
            onSave={(theme) => run(() => supabase.from('review_weeks').upsert({ id: review.week, theme, updated_at: new Date().toISOString() }))} />
        </div>
        <div className="fb-col">
          {CARD_KINDS.map((k) => (
            <Cards key={k.kind} {...k} cards={review.cards || []} readOnly={readOnly}
              onAdd={(kind, text) => run(() => supabase.from('review_cards').insert({ week: review.week, kind, text }))}
              onToggle={(c) => run(() => supabase.from('review_cards').update({ done: !c.done }).eq('id', c.id))} />
          ))}
        </div>
      </div>
    </div>
  )
}
