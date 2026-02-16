import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setTokenCookie, getStateCookie, clearStateCookie } from '../lib/cookies.js'

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token'

async function exchangeCode(code: string, redirectUri: string) {
  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kroger code exchange failed (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(204).end()
  }

  const code = req.query.code as string | undefined
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' })
  }

  // Validate CSRF state parameter
  const state = req.query.state as string | undefined
  const expectedState = getStateCookie(req)
  if (!state || !expectedState || state !== expectedState) {
    return res.status(403).json({ error: 'Invalid OAuth state parameter' })
  }

  const redirectUri = process.env.KROGER_REDIRECT_URI
  if (!redirectUri) {
    return res.status(500).json({ error: 'KROGER_REDIRECT_URI not configured' })
  }

  try {
    const tokens: any = await exchangeCode(code, redirectUri)

    // Validate token format
    if (!tokens.access_token || typeof tokens.access_token !== 'string' || tokens.access_token.length > 4096) {
      throw new Error('Invalid token received from Kroger')
    }

    const expiresIn = Number(tokens.expires_in) || 1800
    setTokenCookie(res, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: Date.now() + expiresIn * 1000,
    })
    clearStateCookie(res)

    // Redirect cleanly — no tokens in URL
    const appUrl = new URL(redirectUri)
    const baseUrl = `${appUrl.protocol}//${appUrl.host}`
    const cookieHeaders = res.getHeader('Set-Cookie')
    const headers: Record<string, any> = { Location: `${baseUrl}/` }
    if (cookieHeaders) headers['Set-Cookie'] = cookieHeaders
    res.writeHead(302, headers)
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.writeHead(302, { Location: `/?kroger_error=${encodeURIComponent(message)}` })
    res.end()
  }
}
