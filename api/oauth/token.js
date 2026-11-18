import { mcpKey, configError, verify, sign, pkceOk } from '../_lib/mcpAuth.js'

// OAuth token step: swaps a code from /api/oauth/authorize for an access
// token, but only with the matching redirect_uri and PKCE code_verifier.
// The token is a signed, expiring blob — never the owner key itself.

const ACCESS_TTL = 30 * 24 * 3600

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  res.setHeader('Cache-Control', 'no-store')
  if (!mcpKey()) return res.status(503).json({ error: 'server_error', error_description: configError() })

  const body = typeof req.body === 'object' && req.body ? req.body : {}
  const bad = (desc) => res.status(400).json({ error: 'invalid_grant', error_description: desc })
  if (body.grant_type !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' })

  const code = verify(body.code, 'code')
  if (!code) return bad('code is invalid or expired')
  if (body.redirect_uri && body.redirect_uri !== code.ru) return bad('redirect_uri does not match')
  if (!pkceOk(body.code_verifier, code.cc)) return bad('code_verifier does not match')

  return res.status(200).json({
    access_token: sign({ t: 'access' }, ACCESS_TTL),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL,
  })
}
