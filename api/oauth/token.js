export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Issue the access token — this is what Claude uses as Bearer in MCP calls.
  // We accept any valid auth code (personal server; the grant page is the gate).
  const token = process.env.DASHBOARD_MCP_KEY || 'life-dashboard-open'

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 7776000,  // 90 days
  })
}
