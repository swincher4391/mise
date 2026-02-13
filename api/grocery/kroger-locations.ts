import type { VercelRequest, VercelResponse } from '@vercel/node'

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token'
let cachedToken: string | null = null
let cachedExpiry = 0

async function getClientToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken
  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=product.compact',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kroger auth failed (${response.status}): ${text.slice(0, 200)}`)
  }
  const data: any = await response.json()
  cachedToken = data.access_token
  cachedExpiry = Date.now() + data.expires_in * 1000
  return data.access_token
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const zipCode = req.query.zipCode as string | undefined
  if (!zipCode || !/^\d{5}$/.test(zipCode)) {
    return res.status(400).json({ error: 'Valid 5-digit zipCode is required' })
  }

  try {
    const token = await getClientToken()
    const url = `https://api.kroger.com/v1/locations?filter.zipCode.near=${zipCode}&filter.limit=5&filter.chain=KROGER`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(502).json({ error: `Kroger API error (${response.status}): ${text.slice(0, 200)}` })
    }

    const data: any = await response.json()
    const locations = (data.data ?? []).map((loc: any) => ({
      locationId: loc.locationId,
      name: loc.name,
      address: {
        line1: loc.address?.addressLine1,
        city: loc.address?.city,
        state: loc.address?.state,
        zipCode: loc.address?.zipCode,
      },
    }))

    return res.status(200).json({ locations })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to search locations: ${message}` })
  }
}
