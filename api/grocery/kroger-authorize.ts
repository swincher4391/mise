import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'crypto'
import { setStateCookie } from '../_lib/cookies.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(204).end()
  }

  const clientId = process.env.KROGER_CLIENT_ID
  const redirectUri = process.env.KROGER_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Kroger OAuth2 not configured' })
  }

  // Generate CSRF state nonce
  const state = randomBytes(16).toString('hex')
  setStateCookie(res, state)

  const authorizeUrl = new URL('https://api.kroger.com/v1/connect/oauth2/authorize')
  authorizeUrl.searchParams.set('scope', 'cart.basic:write profile.compact')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('state', state)

  res.writeHead(302, { ...getCookieHeaders(res), Location: authorizeUrl.toString() })
  res.end()
}

/** Extract Set-Cookie from response so writeHead doesn't discard it */
function getCookieHeaders(res: VercelResponse): Record<string, string | string[]> {
  const cookies = res.getHeader('Set-Cookie')
  if (!cookies) return {}
  return { 'Set-Cookie': cookies as string | string[] }
}
