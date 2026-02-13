import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getClientToken } from './kroger-auth.ts'

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
