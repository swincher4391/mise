import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const KV_KEY = 'sitemap:urls'
const MAX_ENTRIES = 10_000

/**
 * POST /api/sitemap-add
 * Body: { d: string } — the base64url-encoded recipe share payload.
 * Adds the share URL to the sitemap set in Vercel KV.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { d } = req.body ?? {}
  if (!d || typeof d !== 'string' || d.length > 12_000) {
    return res.status(400).json({ error: 'Missing or invalid d parameter' })
  }

  try {
    // Use a sorted set with timestamp as score for ordering
    const count = await kv.zcard(KV_KEY)
    if (count >= MAX_ENTRIES) {
      // Remove oldest entries to stay under limit
      await kv.zremrangebyrank(KV_KEY, 0, 0)
    }

    await kv.zadd(KV_KEY, { score: Date.now(), member: d })

    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
