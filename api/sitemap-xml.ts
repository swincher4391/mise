import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import { decodeSharePayload } from './_lib/sharePayload.js'
import { enforceRateLimit } from './_lib/rateLimit.js'
import { ALLOWED_ORIGINS } from './_lib/cors.js'

const KV_KEY = 'sitemap:urls'
const SHARE_BASE = 'https://mise.swinch.dev/api/r'
const MAX_ENTRIES = 10_000

/**
 * GET  /api/sitemap-xml → serves XML sitemap from Vercel KV
 * POST /api/sitemap-xml → adds a share URL to the sitemap
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    // POST is origin-restricted, so the preflight must echo an allowlisted
    // origin rather than a wildcard.
    const origin = req.headers.origin ?? ''
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method === 'POST') {
    return handleAdd(req, res)
  }

  if (req.method === 'GET') {
    return handleSitemap(req, res)
  }

  if (req.method === 'DELETE') {
    return handleClear(req, res)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * POST: add a share URL to the sitemap.
 *
 * Called by the client when a user shares a recipe, so it can't require a
 * secret. Instead: the payload must decode to a real recipe (no arbitrary
 * blobs), only our own origins get a CORS grant, and writes are rate limited.
 * Together these stop the endpoint from being used to poison the public
 * sitemap with attacker-controlled pages under our domain.
 */
async function handleAdd(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? ''
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const allowed = await enforceRateLimit(req, res, {
    name: 'sitemap-add',
    limit: 20,
    windowSec: 600,
    dailyGlobalLimit: 5000,
  })
  if (!allowed) return

  const { d } = req.body ?? {}
  if (!d || typeof d !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid d parameter' })
  }

  // Reject anything that isn't a well-formed, correctly-sized recipe payload.
  try {
    decodeSharePayload(d)
  } catch {
    return res.status(400).json({ error: 'Invalid recipe payload' })
  }

  try {
    const count = await kv.zcard(KV_KEY)
    if (count >= MAX_ENTRIES) {
      await kv.zremrangebyrank(KV_KEY, 0, 0)
    }

    await kv.zadd(KV_KEY, { score: Date.now(), member: d })

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('sitemap-xml: KV write failed', err)
    return res.status(500).json({ error: 'Failed to record share' })
  }
}

/** DELETE: clear all share URLs from the sitemap */
async function handleClear(req: VercelRequest, res: VercelResponse) {
  const secret = req.headers['x-admin-secret']
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    await kv.del(KV_KEY)
    return res.status(200).json({ ok: true, cleared: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

/** GET: generate XML sitemap from stored URLs */
async function handleSitemap(_req: VercelRequest, res: VercelResponse) {
  try {
    const entries: string[] = await kv.zrange(KV_KEY, 0, -1)

    const urls = entries.map((d) => {
      const loc = `${SHARE_BASE}?d=${encodeURIComponent(d)}`
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`
    })

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mise.swinch.dev/</loc>
  </url>
${urls.join('\n')}
</urlset>`

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600')
    return res.status(200).send(xml)
  } catch {
    // KV not configured — return minimal sitemap
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mise.swinch.dev/</loc>
  </url>
</urlset>`

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=300')
    return res.status(200).send(xml)
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
