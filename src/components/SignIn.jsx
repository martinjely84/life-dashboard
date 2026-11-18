import { useState } from 'react'
import { useAuth, sendMagicLink, signOut } from '../lib/auth'

// The front door when Supabase is configured: email → magic link. Also the
// "signed in but not on the list" and "couldn't check" screens.
export default function SignIn() {
  const a = useAuth()
  const [email, setEmail] = useState('')
  const [state, setState] = useState({ sending: false, sent: false, error: null })

  if (a.status === 'loading' || a.status === 'checking') {
    return <div className="gate"><div className="center">Signing in…</div></div>
  }

  if (a.status === 'not-member' || a.status === 'error') {
    return (
      <div className="gate">
        <form onSubmit={(e) => { e.preventDefault(); signOut() }}>
          <h1>Family board</h1>
          {a.status === 'not-member' ? (
            <p>You're signed in as <strong>{a.email}</strong>, but that address isn't on this board's family list.</p>
          ) : (
            <p>Signed in, but the board couldn't check your access: {a.error}</p>
          )}
          <button type="submit">Sign out</button>
        </form>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setState({ sending: true, sent: false, error: null })
    try {
      await sendMagicLink(email)
      setState({ sending: false, sent: true, error: null })
    } catch (err) {
      // Unknown addresses fail here too ("Signups not allowed") — say it plainly.
      const msg = /signup|not allowed|not found/i.test(err.message)
        ? "That address can't sign in to this board."
        : err.message
      setState({ sending: false, sent: false, error: msg })
    }
  }

  return (
    <div className="gate">
      <form onSubmit={submit}>
        <h1>Family board</h1>
        {state.sent ? (
          <p>Check your email for a sign-in link. Open it on this device and you'll stay signed in.</p>
        ) : (
          <>
            <p>Enter your email and we'll send you a sign-in link.</p>
            <input type="email" value={email} autoFocus autoComplete="email" inputMode="email"
              placeholder="you@example.com" aria-label="Email"
              onChange={(e) => { setEmail(e.target.value); setState((s) => ({ ...s, error: null })) }} />
            <button type="submit" disabled={state.sending}>{state.sending ? 'Sending…' : 'Send link'}</button>
            {state.error && <div className="bad">{state.error}</div>}
          </>
        )}
      </form>
    </div>
  )
}
