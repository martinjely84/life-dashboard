import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/backend'
import { fmtDate, fmtTime } from '../../lib/tz'

// TV screens: read-only links for TVs and other shared screens (Fire TV
// Silk, a smart-TV browser…) so they can show the board without anyone
// typing a password on a remote. Each link carries a long random token in
// the URL fragment; only its hash is stored. Revoke a link and that screen
// stops updating within a minute.

const when = (iso) => (iso ? `${fmtDate(iso, { day: 'numeric', month: 'short' })} ${fmtTime(iso)}` : 'never')

export default function DeviceLinks({ demo }) {
  const [devices, setDevices] = useState([])
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState(null) // { label, url } — shown once
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || demo) return
    const { data, error: e } = await supabase.from('board_devices')
      .select('id,label,created_at,created_by,last_seen_at,revoked_at').order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setDevices(data || [])
  }, [demo])
  useEffect(() => { load() }, [load])

  if (demo || !supabase) {
    return <div className="banner"><p>Screen links need Supabase. In demo mode, just open <a href="/tv">/tv</a>.</p></div>
  }

  const create = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    setError(null)
    const { data: token, error: err } = await supabase.rpc('create_board_device', { p_label: label.trim() })
    setBusy(false)
    if (err) { setError(err.message); return }
    setFresh({ label: label.trim(), url: `${window.location.origin}/tv#k=${token}` })
    setLabel('')
    setCopied(false)
    load()
  }

  const revoke = async (d) => {
    if (!window.confirm(`Revoke "${d.label}"? That screen will stop showing the board.`)) return
    const { error: err } = await supabase.rpc('revoke_board_device', { p_id: d.id })
    if (err) setError(err.message)
    load()
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh.url); setCopied(true) } catch { setCopied(false) }
  }

  const active = devices.filter((d) => !d.revoked_at)
  const revoked = devices.filter((d) => d.revoked_at)

  return (
    <div className="fb-devices">
      {error && <div className="err">{error}</div>}
      <section className="panel fb-card">
        <div className="sl fb-sl">New screen link</div>
        <p className="fb-hint">
          Makes a link that shows the board read-only — no sign-in, and nothing on it can change your data.
          Anyone who has the link can see the board, so treat it like a key and revoke it if it leaks.
        </p>
        <form className="fb-add" onSubmit={create}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this screen, e.g. Living room TV"
            aria-label="Screen name" maxLength={80} autoComplete="off" />
          <button type="submit" className="btn-g" disabled={busy || !label.trim()}>{busy ? 'Making…' : 'Make link'}</button>
        </form>
        {fresh && (
          <div className="fb-fresh">
            <div><strong>{fresh.label}</strong> — copy this now; it won't be shown again.</div>
            <code className="fb-url">{fresh.url}</code>
            <div className="fb-fresh-act">
              <button className="btn-p" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
              <span className="fb-hint">
                On the TV, open the link in its browser and bookmark it. For the weekly review layout,
                put <code>?mode=review</code> before the <code>#</code>: …/tv?mode=review#k=…
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="panel fb-card">
        <div className="sl fb-sl">Screens<span className="pbadge">{active.length}</span></div>
        {active.length ? (
          <ul className="fb-dev-list">
            {active.map((d) => (
              <li key={d.id}>
                <div>
                  <div className="fb-dev-nm">{d.label}</div>
                  <div className="fb-dev-meta">Made {when(d.created_at)}{d.created_by ? ` by ${d.created_by}` : ''} · last seen {when(d.last_seen_at)}</div>
                </div>
                <button className="btn-s danger" onClick={() => revoke(d)}>Revoke</button>
              </li>
            ))}
          </ul>
        ) : <div className="empty">No screens linked yet.</div>}
        {revoked.length > 0 && (
          <details className="fb-revoked">
            <summary>{revoked.length} revoked</summary>
            <ul className="fb-dev-list">
              {revoked.map((d) => (
                <li key={d.id}><div><div className="fb-dev-nm">{d.label}</div><div className="fb-dev-meta">Revoked {when(d.revoked_at)}</div></div></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  )
}
