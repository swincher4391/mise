import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setPublicCors } from '../_lib/cors.ts'

const INSTACART_BASE = process.env.INSTACART_API_URL ?? 'https://connect.instacart.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPublicCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.INSTACART_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'INSTACART_API_KEY not configured' })
  }

  const body = req.body
  if (!body || !body.title || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return res.status(400).json({ error: 'title and ingredients array are required' })
  }

  try {
    const requestBody: Record<string, unknown> = {
      title: body.title,
      ingredients: body.ingredients,
    }

    if (body.image_url) requestBody.image_url = body.image_url
    if (body.author) requestBody.author = body.author
    if (body.servings) requestBody.servings = body.servings
    if (body.cooking_time) requestBody.cooking_time = body.cooking_time
    if (body.instructions) requestBody.instructions = body.instructions
    if (body.landing_page_configuration) requestBody.landing_page_configuration = body.landing_page_configuration

    const response = await fetch(`${INSTACART_BASE}/idp/v1/products/recipe`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({
        error: `Instacart API error (${response.status}): ${errorText.slice(0, 200)}`,
      })
    }

    const data = await response.json()
    return res.status(200).json({ url: data.products_link_url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Instacart request failed: ${message}` })
  }
}
