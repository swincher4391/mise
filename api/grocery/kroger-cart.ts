import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getTokenFromCookie } from '../_lib/cookies.js'
import { setAuthenticatedCors } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAuthenticatedCors(req, res)

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })

  // Read token from encrypted cookie — never from request body
  const session = getTokenFromCookie(req)
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated with Kroger' })
  }

  const { items } = req.body ?? {}
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' })
  }

  try {
    const response = await fetch('https://api.kroger.com/v1/cart/add', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        items: items.map((item: { upc: string; quantity: number }) => ({
          upc: item.upc,
          quantity: item.quantity,
        })),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({
        error: `Kroger cart error (${response.status}): ${text.slice(0, 200)}`,
      })
    }

    return res.status(204).end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to add to cart: ${message}` })
  }
}
