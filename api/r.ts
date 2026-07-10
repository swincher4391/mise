import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildRecipeHtml } from './_lib/recipeHtml.js'
import { decodeSharePayload, MAX_ENCODED_BYTES } from './_lib/sharePayload.js'

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

  try {
    const payload = decodeSharePayload(encoded)

    // Build the full share URL for OG meta tags, pass raw encoded data for CTA import
    const shareUrl = `https://mise.swinch.dev/api/r?d=${encodeURIComponent(encoded)}`
    const html = buildRecipeHtml(payload, shareUrl, encoded)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=31536000')
    return res.status(200).send(html)
  } catch {
    return res.status(400).json({ error: 'Failed to decode recipe' })
  }
}
