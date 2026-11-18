// Shared auth for /api/mcp and the OAuth endpoints Claude.ai uses to
// connect to it. (Files under api/_lib are not routes on Vercel.)
//
// There is deliberately NO default key: if DASHBOARD_MCP_KEY is unset or
// short, every endpoint refuses to work. Codes and access tokens are
// stateless HMAC-signed blobs keyed by DASHBOARD_MCP_KEY, so rotating that
// key revokes every token Claude holds.

import { createHmac, createHash, timingSafeEqual } from 'crypto'

const MIN_KEY_LENGTH = 32

export function mcpKey() {
  const k = process.env.DASHBOARD_MCP_KEY || ''
  return k.length >= MIN_KEY_LENGTH ? k : null
}

export const configError = () =>
  `DASHBOARD_MCP_KEY must be set (at least ${MIN_KEY_LENGTH} random characters) in the Vercel environment`

export function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const mac = (key, data) => createHmac('sha256', key).update(data).digest('base64url')

/** Signed, expiring token: base64url(json).hmac */
export function sign(payload, ttlSeconds) {
  const key = mcpKey()
  if (!key) throw new Error(configError())
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  return `${body}.${mac(key, body)}`
}

/** The payload if the token is ours, unexpired and of the given type; else null. */
export function verify(token, type) {
  const key = mcpKey()
  if (!key || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig || !safeEqual(sig, mac(key, body))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (p.t !== type || !(p.exp > Date.now() / 1000)) return null
    return p
  } catch {
    return null
  }
}

/** PKCE S256: base64url(sha256(verifier)) === challenge. */
export const pkceOk = (verifier, challenge) =>
  typeof verifier === 'string' && verifier.length >= 43 && verifier.length <= 128
  && safeEqual(createHash('sha256').update(verifier).digest('base64url'), challenge)

/** Only send codes back to Claude (override with MCP_REDIRECT_HOSTS, comma-separated). */
export function redirectAllowed(uri) {
  const hosts = (process.env.MCP_REDIRECT_HOSTS || 'claude.ai,claude.com')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  try {
    const u = new URL(uri)
    const h = u.hostname.toLowerCase()
    return u.protocol === 'https:' && hosts.some((x) => h === x || h.endsWith(`.${x}`))
  } catch {
    return false
  }
}

/** Is this request's bearer token the raw key or an access token we issued? */
export function bearerOk(req) {
  const key = mcpKey()
  if (!key) return false
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  return safeEqual(m[1], key) || !!verify(m[1], 'access')
}
