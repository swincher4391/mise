import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  const authorizeUrl = new URL('https://api.kroger.com/v1/connect/oauth2/authorize')
  authorizeUrl.searchParams.set('scope', 'cart.basic:write profile.compact')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')

  res.writeHead(302, { Location: authorizeUrl.toString() })
  res.end()
}
