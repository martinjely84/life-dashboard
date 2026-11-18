// Sign-in state. Family members sign in with a magic link (Supabase Auth);
// whether an account may see anything is decided in the database by the
// app_members allowlist (is_family_member()), not here — this module only
// asks, so it can show a helpful screen instead of an empty app.
//
// status: local       — no Supabase configured (localStorage demo mode)
//         loading     — reading a stored session
//         signed-out
//         checking    — signed in, asking the database about membership
//         member      — on the allowlist: load the app
//         not-member  — signed in, but not on the allowlist
//         error       — couldn't ask (e.g. migration 01 not applied yet)

import { useSyncExternalStore } from 'react'
import { supabase } from './backend'

let auth = { status: supabase ? 'loading' : 'local', email: null, error: null }
const listeners = new Set()
const set = (patch) => { auth = { ...auth, ...patch }; listeners.forEach((fn) => fn()) }

export const useAuth = () => useSyncExternalStore(
  (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  () => auth,
)

let checkedUser = null

async function check(session) {
  if (!session) {
    checkedUser = null
    set({ status: 'signed-out', email: null, error: null })
    return
  }
  const user = session.user
  if (checkedUser === user.id && ['member', 'not-member'].includes(auth.status)) return
  checkedUser = user.id
  set({ status: 'checking', email: user.email, error: null })
  const { data, error } = await supabase.rpc('is_family_member')
  if (checkedUser !== user.id) return // signed out or switched meanwhile
  if (error) set({ status: 'error', error: error.message })
  else set({ status: data ? 'member' : 'not-member' })
}

if (supabase) {
  // Supabase calls made inside onAuthStateChange can deadlock its auth
  // lock, so the membership check runs on the next tick.
  supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => check(session), 0) })
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      // Only accounts that already exist (invited in Supabase) can sign in.
      shouldCreateUser: false,
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
  window.location.reload() // drop every cached row from memory
}
