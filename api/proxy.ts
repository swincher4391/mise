import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isBlockedUrl, isBlockedAfterResolve } from './_lib/ssrf.js'
import { enforceRateLimit } from './_lib/rateLimit.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  // Generous — this is the core extraction path — but bounded so the proxy
  // can't be used as free bandwidth. Checked before the SSRF resolve so a
  // flood can't drive DNS lookups either.
  const allowed = await enforceRateLimit(req, res, {
    name: 'proxy',
    limit: 60,
    windowSec: 600,
    dailyGlobalLimit: 10_000,
  })
  if (!allowed) return

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  if (await isBlockedAfterResolve(targetUrl)) {
    return res.status(403).json({ error: 'URL resolves to a blocked address' })
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    })

    // Re-resolve the final URL: a redirect to a hostname that *resolves* to a
    // private IP passes the pattern check but not the DNS check.
    if (isBlockedUrl(response.url) || (await isBlockedAfterResolve(response.url))) {
      return res.status(403).json({ error: 'Redirect target URL not allowed' })
    }

    const html = await response.text()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Upstream-Status', String(response.status))
    res.setHeader('Content-Security-Policy', 'sandbox')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to fetch URL: ${message}` })
  }
}
