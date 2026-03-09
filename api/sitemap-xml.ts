import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const KV_KEY = 'sitemap:urls'
const SHARE_BASE = 'https://mise.swinch.dev/api/r'
const MAX_ENTRIES = 10_000

/**
 * GET  /api/sitemap-xml → serves XML sitemap from Vercel KV
 * POST /api/sitemap-xml → adds a share URL to the sitemap
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
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

/** POST: add a share URL to the sitemap */
async function handleAdd(req: VercelRequest, res: VercelResponse) {
  const { d } = req.body ?? {}
  if (!d || typeof d !== 'string' || d.length > 12_000) {
    return res.status(400).json({ error: 'Missing or invalid d parameter' })
  }

  try {
    const count = await kv.zcard(KV_KEY)
    if (count >= MAX_ENTRIES) {
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
