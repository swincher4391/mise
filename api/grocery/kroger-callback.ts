import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exchangeCode } from './kroger-auth.ts'

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
    const tokens = await exchangeCode(code, redirectUri)

    // Redirect to app with tokens in hash fragment (not query params, for security)
    const appUrl = new URL(redirectUri)
    // Redirect to the app root with hash params
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
