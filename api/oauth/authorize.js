import { createHmac } from 'crypto'

function makeCode(redirectUri, state) {
  const secret = process.env.DASHBOARD_MCP_KEY || 'life-dashboard-open'
  return createHmac('sha256', secret)
    .update(`${redirectUri}|${state || ''}`)
    .digest('hex')
    .slice(0, 40)
}

export default function handler(req, res) {
  const { redirect_uri, state, grant } = req.query

  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }

  // User clicked "Grant Access"
  if (grant === '1') {
    const code = makeCode(redirect_uri, state)
    const dest = new URL(redirect_uri)
    dest.searchParams.set('code', code)
    if (state) dest.searchParams.set('state', state)
    return res.redirect(302, dest.toString())
  }

  // Build the grant URL that includes all current params + grant=1
  const selfUrl = new URL(`https://${req.headers.host}/api/oauth/authorize`)
  for (const [k, v] of Object.entries(req.query)) selfUrl.searchParams.set(k, v)
  selfUrl.searchParams.set('grant', '1')

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Claude to Life Dashboard</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0d0f14;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1c23;border:1px solid #2a2c35;border-radius:16px;padding:40px;max-width:400px;text-align:center}
    h1{font-size:1.4rem;margin-bottom:12px;color:#fff}
    p{color:#9a9aaa;margin-bottom:28px;line-height:1.5}
    a{display:inline-block;background:#c8a96e;color:#0d0f14;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem}
    a:hover{background:#d4b87a}
    .icon{font-size:2.5rem;margin-bottom:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚡</div>
    <h1>Connect Claude to your Life Dashboard</h1>
    <p>This gives Claude read and write access to your domains, goals, todos and habits.</p>
    <a href="${selfUrl.toString()}">Grant Access</a>
  </div>
</body>
</html>`)
}
