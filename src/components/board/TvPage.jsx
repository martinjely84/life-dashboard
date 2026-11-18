import { useEffect, useState } from 'react'
import TvBoard from './TvBoard'
import { hasSupabase } from '../../lib/backend'
import { init } from '../../lib/store'
import { useAuth } from '../../lib/auth'
import { useMemberBoard, useDeviceBoard, useDemoBoard, deviceToken, forgetDeviceToken } from '../../lib/boardData'

// /tv — what a TV browser opens. Three ways in:
//   /tv#k=<token>   a device link made under Family board → TV screens.
//                   Read-only, no account. The token sits in the URL
//                   fragment, which browsers never send to a server.
//   signed in       a family member's own browser (e.g. laptop on HDMI).
//   no Supabase     the demo family.
// Add ?mode=review for the weekly review layout.

const RELOAD_MS = 6 * 60 * 60 * 1000 // pick up new deploys, shed any leaks

const isReview = () => new URLSearchParams(window.location.search).get('mode') === 'review'

function useTvChrome() {
  // Dark, fixed-size page: theme + no scrolling only while /tv is open.
  useEffect(() => {
    document.documentElement.classList.add('tv-mode')
    document.title = 'Family board · TV'
    return () => document.documentElement.classList.remove('tv-mode')
  }, [])
  // Keep the screen awake where the browser allows it.
  useEffect(() => {
    let lock = null
    const take = async () => {
      try { if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen') } catch { /* not allowed: fine */ }
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => { document.removeEventListener('visibilitychange', take); lock?.release?.() }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), RELOAD_MS)
    return () => clearTimeout(t)
  }, [])
}

function DeviceTv({ token, review }) {
  const board = useDeviceBoard(token, { fast: review })
  if (board.status === 'revoked') {
    return (
      <Message title="This screen's link no longer works">
        It was revoked, or mistyped. Make a new one on your phone: Family board → TV screens → New screen link,
        then open it on this TV.
        <button className="tv-btn" onClick={() => { forgetDeviceToken(); window.location.replace('/tv') }}>Forget this link</button>
      </Message>
    )
  }
  return <TvBoard board={board} review={review} />
}

function MemberTv({ review }) {
  useEffect(() => { init() }, [])
  return <TvBoard board={useMemberBoard()} review={review} />
}

function DemoTv({ review }) {
  return <TvBoard board={useDemoBoard()} review={review} note="Demo family — connect Supabase to see yours" />
}

function Message({ title, children }) {
  return (
    <div className="tv">
      <div className="tv-msg">
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  )
}

export default function TvPage() {
  useTvChrome()
  const [review, setReview] = useState(isReview)
  useEffect(() => {
    const onPop = () => setReview(isReview())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const [token] = useState(deviceToken)
  const auth = useAuth()

  if (!hasSupabase) return <DemoTv review={review} />
  if (token) return <DeviceTv token={token} review={review} />
  if (auth.status === 'member') return <MemberTv review={review} />
  if (auth.status === 'loading' || auth.status === 'checking') return <Message title="Loading…" />
  return (
    <Message title="This screen isn't linked yet">
      On your phone or laptop, open the family board, go to TV screens and make a new screen link.
      Then open that link in this TV's browser and bookmark it.
    </Message>
  )
}
