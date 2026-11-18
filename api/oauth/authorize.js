import { mcpKey, configError, safeEqual, sign, redirectAllowed } from '../_lib/mcpAuth.js'

// OAuth authorize step for the Claude.ai connector. The page asks for the
// owner key (DASHBOARD_MCP_KEY) — a link click alone no longer grants
// access. On success it redirects back to Claude with a short-lived,
// signed, PKCE-bound code.

const CODE_TTL = 5 * 60

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function page(res, status, params, error) {
  const hidden = Object.entries(params)
    .filter(([k]) => k !== 'owner_key')
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
  res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Claude to Life Dashboard</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0d0f14;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
    .card{background:#1a1c23;border:1px solid #2a2c35;border-radius:16px;padding:40px;max-width:420px;width:100%;text-align:center}
    h1{font-size:1.4rem;margin-bottom:12px;color:#fff}
    p{color:#9a9aaa;margin-bottom:20px;line-height:1.5}
    input{width:100%;padding:12px;border-radius:10px;border:1px solid #2a2c35;background:#0d0f14;color:#fff;margin-bottom:14px;font-size:1rem}
    button{background:#c8a96e;color:#0d0f14;padding:14px 32px;border-radius:10px;border:0;font-weight:700;font-size:1rem;cursor:pointer}
    .err{color:#ff6b6b;margin-bottom:14px}
    .icon{font-size:2.5rem;margin-bottom:16px}
  </style>
</head>
<body>
  <form class="card" method="post" action="/api/oauth/authorize">
    <div class="icon">⚡</div>
    <h1>Connect Claude to your Life Dashboard</h1>
    <p>This gives Claude read and write access to your domains, goals, to-dos and habits. Enter the owner key to allow it.</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <input type="password" name="owner_key" placeholder="Owner key" autocomplete="off" required autofocus>
    ${hidden}
    <button type="submit">Grant access</button>
  </form>
</body>
</html>`)
}

export default function handler(req, res) {
  if (!mcpKey()) return res.status(503).send(configError())
  const params = { ...(req.query || {}), ...(req.method === 'POST' && typeof req.body === 'object' ? req.body : {}) }
  delete params.grant
  const { redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: method } = params

  if (!redirectUri || !redirectAllowed(redirectUri)) return res.status(400).send('Missing or unrecognised redirect_uri')
  if (!challenge || (method && method !== 'S256')) return res.status(400).send('PKCE (code_challenge, S256) is required')

  if (req.method === 'GET') return page(res, 200, params)
  if (req.method !== 'POST') return res.status(405).end()

  if (!safeEqual(params.owner_key || '', mcpKey())) {
    return page(res, 401, params, 'That key is not right.')
  }

  const code = sign({ t: 'code', ru: redirectUri, cc: challenge }, CODE_TTL)
  const dest = new URL(redirectUri)
  dest.searchParams.set('code', code)
  if (state) dest.searchParams.set('state', state)
  return res.redirect(302, dest.toString())
}
