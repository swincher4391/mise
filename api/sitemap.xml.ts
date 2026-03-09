import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const KV_KEY = 'sitemap:urls'
const SHARE_BASE = 'https://mise.swinch.dev/api/r'

/**
 * GET /api/sitemap.xml
 * Generates an XML sitemap from all shared recipe URLs stored in Vercel KV.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Fetch all members with scores (timestamps) — newest first
    const entries: string[] = await kv.zrange(KV_KEY, 0, -1)

    const urls = entries.map((d) => {
      const loc = `${SHARE_BASE}?d=${encodeURIComponent(d)}`
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`
    })

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mise.swinch.dev</loc>
  </url>
${urls.join('\n')}
</urlset>`

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).send(xml)
  } catch (err) {
    // If KV is not configured yet, return a minimal sitemap
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mise.swinch.dev</loc>
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
