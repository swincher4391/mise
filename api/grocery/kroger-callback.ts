import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const redirectUri = process.env.KROGER_REDIRECT_URI
  if (!redirectUri) {
    return res.status(500).json({ error: 'KROGER_REDIRECT_URI not configured' })
  }

  try {
    const tokens: any = await exchangeCode(code, redirectUri)
    const appUrl = new URL(redirectUri)
    const baseUrl = `${appUrl.protocol}//${appUrl.host}`
    const hash = `#kroger_access_token=${tokens.access_token}&kroger_refresh_token=${tokens.refresh_token ?? ''}&kroger_expires_in=${tokens.expires_in}`
    res.writeHead(302, { Location: `${baseUrl}/${hash}` })
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.writeHead(302, { Location: `/?kroger_error=${encodeURIComponent(message)}` })
    res.end()
  }
}
