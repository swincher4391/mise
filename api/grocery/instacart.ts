/**
 * Instacart "Get Ingredients" link creation.
 * One function serving both flows (kept merged to stay under Vercel's
 * serverless-function limit), discriminated by the `?type=` query param:
 *   - ?type=recipe → recipe page  (POST /idp/v1/products/recipe)
 *   - ?type=list   → shopping list (POST /idp/v1/products/products_link)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setPublicCors } from '../_lib/cors.js'
import { enforceRateLimit } from '../_lib/rateLimit.js'

const INSTACART_BASE = process.env.INSTACART_API_URL ?? 'https://connect.instacart.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPublicCors(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Calls our Instacart partner API with the affiliate key. Abuse here risks
  // the partner relationship, not just cost.
  const allowed = await enforceRateLimit(req, res, {
    name: 'instacart',
    limit: 20,
    windowSec: 600,
    dailyGlobalLimit: 3000,
  })
  if (!allowed) return

  const apiKey = process.env.INSTACART_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'INSTACART_API_KEY not configured' })
  }

  const type = req.query.type
  if (type !== 'recipe' && type !== 'list') {
    return res.status(400).json({ error: 'Query param type must be "recipe" or "list"' })
  }

  const body = req.body
  let instacartPath: string
  let requestBody: Record<string, unknown>

  if (type === 'recipe') {
    if (!body || !body.title || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return res.status(400).json({ error: 'title and ingredients array are required' })
    }
    requestBody = {
      title: body.title,
      ingredients: body.ingredients,
    }
    if (body.image_url) requestBody.image_url = body.image_url
    if (body.author) requestBody.author = body.author
    if (body.servings) requestBody.servings = body.servings
    if (body.cooking_time) requestBody.cooking_time = body.cooking_time
    if (body.instructions) requestBody.instructions = body.instructions
    requestBody.landing_page_configuration = { enable_pantry_items: true }
    instacartPath = '/idp/v1/products/recipe'
  } else {
    if (!body || !Array.isArray(body.line_items) || body.line_items.length === 0) {
      return res.status(400).json({ error: 'line_items array is required' })
    }
    requestBody = {
      title: body.title ?? 'Shopping List',
      line_items: body.line_items,
      landing_page_configuration: { enable_pantry_items: true },
    }
    instacartPath = '/idp/v1/products/products_link'
  }

  try {
    const response = await fetch(`${INSTACART_BASE}${instacartPath}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      console.error('instacart: API error', response.status, await response.text())
      return res.status(response.status).json({
        error: 'Could not create the Instacart list right now. Please try again.',
      })
    }

    const data = await response.json()
    const url = data.products_link_url
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return res.status(502).json({ error: 'Invalid URL returned from Instacart' })
    }

    const partnerId = process.env.IMPACT_PARTNER_ID
    const finalUrl = partnerId
      ? `${url}${url.includes('?') ? '&' : '?'}utm_campaign=instacart-idp&utm_medium=affiliate&utm_source=instacart_idp&utm_term=partnertype-mediapartner&utm_content=campaignid-20313_partnerid-${partnerId}`
      : url

    return res.status(200).json({ url: finalUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Instacart request failed: ${message}` })
  }
}
