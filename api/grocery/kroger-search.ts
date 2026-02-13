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

  const term = req.query.term as string | undefined
  const locationId = req.query.locationId as string | undefined

  if (!term) return res.status(400).json({ error: 'term query parameter is required' })
  if (!locationId) return res.status(400).json({ error: 'locationId query parameter is required' })

  try {
    const token = await getClientToken()
    const url = `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=5`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(502).json({ error: `Kroger API error (${response.status}): ${text.slice(0, 200)}` })
    }

    const data: any = await response.json()
    const products = (data.data ?? []).map((p: any) => {
      const price = p.items?.[0]?.price
      const image = p.images?.find((i: any) => i.perspective === 'front')
      const imageUrl = image?.sizes?.find((s: any) => s.size === 'medium')?.url
        ?? image?.sizes?.find((s: any) => s.size === 'small')?.url
        ?? image?.sizes?.[0]?.url
        ?? null

      return {
        productId: p.productId,
        upc: p.upc,
        name: p.description,
        brand: p.brand,
        imageUrl,
        price: price?.regular ?? null,
        promoPrice: price?.promo && price.promo > 0 ? price.promo : null,
        size: p.items?.[0]?.size ?? null,
        inStock: p.items?.[0]?.fulfillment?.inStore ?? false,
      }
    })

    return res.status(200).json({ products })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to search products: ${message}` })
  }
}
