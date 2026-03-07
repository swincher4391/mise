import type { VercelRequest, VercelResponse } from '@vercel/node'
import { gunzipSync } from 'node:zlib'
import { buildRecipeHtml } from './_lib/recipeHtml.js'

const MAX_ENCODED_BYTES = 12_000

/** Bot/crawler User-Agent patterns — serve full HTML for rich previews */
const BOT_UA = /bot|crawl|spider|pinterest|facebook|twitter|slack|telegram|discord|whatsapp|linkedin|preview|embed|fetch|curl|wget|headless/i

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return res.status(204).end()
  }

  const encoded = req.query.d
  if (!encoded || typeof encoded !== 'string') {
    return res.status(400).json({ error: 'Missing ?d= parameter' })
  }

  if (Buffer.byteLength(encoded, 'utf8') > MAX_ENCODED_BYTES) {
    return res.status(413).json({ error: 'Payload too large' })
  }

  // Real users → redirect straight to the app with ?import= for instant load.
  // Bots/crawlers → fall through to full HTML with OG tags, JSON-LD, rich pins.
  const ua = req.headers['user-agent'] ?? ''
  if (!BOT_UA.test(ua)) {
    const importUrl = `https://mise.swinch.dev?import=${encodeURIComponent(encoded)}`
    res.setHeader('Location', importUrl)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(302).end()
  }

  try {
    // base64url → base64 → Buffer → gunzip → JSON
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const compressed = Buffer.from(base64, 'base64')
    const json = gunzipSync(compressed).toString('utf8')
    const payload = JSON.parse(json)

    if (!payload.t || typeof payload.t !== 'string') {
      return res.status(400).json({ error: 'Invalid payload: title required' })
    }

    if (!Array.isArray(payload.ig)) {
      return res.status(400).json({ error: 'Invalid payload: ingredients required' })
    }

    if (!Array.isArray(payload.st)) {
      payload.st = []
    }

    // Build the full share URL for OG meta tags, pass raw encoded data for CTA import
    const shareUrl = `https://mise.swinch.dev/api/r?d=${encodeURIComponent(encoded)}`
    const html = buildRecipeHtml(payload, shareUrl, encoded)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(400).json({ error: `Failed to decode recipe: ${message}` })
  }
}
