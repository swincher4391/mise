import type { VercelRequest, VercelResponse } from '@vercel/node'
import { gunzipSync } from 'node:zlib'
import { buildRecipeHtml } from './_lib/recipeHtml.ts'

const MAX_ENCODED_BYTES = 12_000

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

    const html = buildRecipeHtml(payload)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(400).json({ error: `Failed to decode recipe: ${message}` })
  }
}
