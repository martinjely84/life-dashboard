import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import DomainView from './components/DomainView'
import Lists from './components/Lists'
import Today from './components/Today'
import MealPlanner from './components/MealPlanner'
import PersonPanel from './components/PersonPanel'
import CeoBot from './components/CeoBot'
import SignIn from './components/SignIn'
import FamilyBoard from './components/board/FamilyBoard'
import TvPage from './components/board/TvPage'
import { useStore, init, isCloud, replaceAllWith } from './lib/store'
import { hasSupabase } from './lib/backend'
import { useAuth, signOut } from './lib/auth'
import { useMemberBoard, useDemoBoard } from './lib/boardData'
import { detectLegacy, rowsFromLegacy, dismissLegacy, legacyDismissed } from './lib/migrate'

// Local-only mode keeps the old optional passphrase screen. With Supabase,
// real sign-in (magic link + allowlist + RLS) replaces it.
const PASSPHRASE = hasSupabase ? '' : import.meta.env.VITE_APP_PASSPHRASE?.trim()

// Header text. Set these in .env.local (and in Vercel) so personal detail
// stays out of the repository.
const OWNER = import.meta.env.VITE_OWNER_NAME?.trim() || 'My'
const SUBTITLE = import.meta.env.VITE_OWNER_SUBTITLE?.trim() || ''
const LOCATION = import.meta.env.VITE_OWNER_LOCATION?.trim() || ''

function Gate({ onPass }) {
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (value === PASSPHRASE) {
      sessionStorage.setItem('mld-gate', '1')
      onPass()
    } else setBad(true)
  }

  return (
    <div className="gate">
      <form onSubmit={submit}>
        <h1>Command centre</h1>
        <p>Enter the passphrase to continue.</p>
        <input type="password" value={value} autoFocus
          onChange={(e) => { setValue(e.target.value); setBad(false) }} />
        <button type="submit">Enter</button>
        {bad && <div className="bad">Not quite — try again.</div>}
      </form>
    </div>
  )
}

function Header() {
  const auth = useAuth()
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <header className="hdr">
      <div>
        <h1>{OWNER} <em>command centre</em></h1>
        {SUBTITLE && <p>{SUBTITLE}</p>}
      </div>
      <div className="hdr-r">
        {LOCATION && <div className="loc">📍 {LOCATION}</div>}
        <div className="dt">{today}</div>
        <div className={`sync${isCloud ? ' cloud' : ''}`}>
          {isCloud ? '☁ synced' : '○ local only'}
        </div>
        {auth.email && (
          <button className="signout" onClick={signOut} title={`Signed in as ${auth.email}`}>Sign out</button>
        )}
      </div>
    </header>
  )
}

function LegacyBanner({ legacy, onDone }) {
  const run = async () => {
    const ok = window.confirm(
      `Import ${legacy.goals} goals from the old dashboard?\n\n`
      + 'This REPLACES everything currently in this app with the old data. '
      + 'Your old dashboard file is not touched.',
    )
    if (!ok) return
    await replaceAllWith(rowsFromLegacy(legacy.raw))
    dismissLegacy()
    onDone()
  }

  return (
    <div className="banner">
      <p>
        Found your old dashboard in this browser — <strong>{legacy.goals} goals</strong>. Import them?
      </p>
      <button className="btn-p" onClick={run}>Import</button>
      <button className="btn-s" onClick={() => { dismissLegacy(); onDone() }}>No thanks</button>
    </div>
  )
}

const MemberBoard = () => <FamilyBoard board={useMemberBoard()} />
const DemoBoard = () => <FamilyBoard board={useDemoBoard()} />

// Views with their own address, so a phone can bookmark /board.
const PATHS = { board: '/board' }
const viewFromPath = () => (window.location.pathname.replace(/\/+$/, '') === '/board' ? 'board' : 'dashboard')

export default function App() {
  // The TV page is its own thing: no app chrome, and it can run without a
  // signed-in user (read-only device link).
  if (window.location.pathname.startsWith('/tv')) return <TvPage />
  return <Gated />
}

function Gated() {
  const auth = useAuth()
  if (hasSupabase && auth.status !== 'member') return <SignIn />
  return <Main />
}

function Main() {
  const s = useStore()
  const [gated, setGated] = useState(
    Boolean(PASSPHRASE) && sessionStorage.getItem('mld-gate') !== '1',
  )
  const [view, setViewState] = useState({ name: viewFromPath() })
  const setView = (v) => {
    const path = PATHS[v.name] || '/'
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
    setViewState(v)
  }
  useEffect(() => {
    const onPop = () => setViewState({ name: viewFromPath() })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [person, setPerson] = useState(null)
  const [legacy, setLegacy] = useState(null)

  useEffect(() => {
    if (gated) return
    init()
    if (!legacyDismissed()) setLegacy(detectLegacy())
  }, [gated])

  if (gated) return <Gate onPass={() => setGated(false)} />

  return (
    <div className="wrap">
      <Header />

      <nav className="nav">
        <button className={view.name === 'board' ? 'on' : ''}
          onClick={() => setView({ name: 'board' })}>Family board</button>
        <button className={view.name === 'dashboard' ? 'on' : ''}
          onClick={() => setView({ name: 'dashboard' })}>Dashboard</button>
        <button className={view.name === 'today' ? 'on' : ''}
          onClick={() => setView({ name: 'today' })}>Today</button>
        <button className={view.name === 'lists' ? 'on' : ''}
          onClick={() => setView({ name: 'lists' })}>Lists</button>
        <button className={view.name === 'meals' ? 'on' : ''}
          onClick={() => setView({ name: 'meals' })}>Meals</button>
        {view.name === 'domain' && <button className="on">{
          s.domains.find((d) => d.id === view.id)?.name || 'Domain'
        }</button>}
      </nav>

      {legacy && <LegacyBanner legacy={legacy} onDone={() => setLegacy(null)} />}

      {s.status === 'error' && (
        <div className="err">
          <strong>Could not reach the database.</strong> {s.error}
          <div style={{ marginTop: 6, color: 'var(--mut)' }}>
            Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, and that schema.sql and the migrations have been run.
          </div>
        </div>
      )}

      {/* Static plan from src/lib/meals.js — doesn't need the database. */}
      {view.name === 'meals' && <MealPlanner />}

      {/* The family board shows its own loading and error states. */}
      {view.name === 'board' && (isCloud ? <MemberBoard /> : <DemoBoard />)}

      {s.status === 'loading' && !['meals', 'board'].includes(view.name) && <div className="center">Loading…</div>}

      {s.status === 'ready' && (
        <>
          {view.name === 'dashboard' && (
            <Dashboard onOpenDomain={(id) => setView({ name: 'domain', id })} />
          )}
          {view.name === 'domain' && (
            <DomainView
              key={`${view.id}:${view.folderId || ''}:${view.focusItemId || ''}`}
              domainId={view.id}
              initialFolderId={view.folderId || null}
              focusItemId={view.focusItemId || null}
              onBack={() => setView({ name: 'dashboard' })}
              onOpenPerson={setPerson}
              onOpenMeals={() => setView({ name: 'meals' })}
            />
          )}
          {view.name === 'today' && <Today />}
          {view.name === 'lists' && (
            <Lists
              onOpen={(row) => {
                // Person goals live in a hidden folder — open the person panel.
                if (row.personId) { setPerson(row.personId); return }
                if (!row.domainId || !row.folderId) return
                setView({
                  name: 'domain',
                  id: row.domainId,
                  folderId: row.folderId,
                  focusItemId: row.id,
                })
              }}
            />
          )}
        </>
      )}

      {person && <PersonPanel personId={person} onClose={() => setPerson(null)} />}
      {s.status === 'ready' && <CeoBot />}
    </div>
  )
}
