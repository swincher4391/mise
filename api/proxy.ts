import type { VercelRequest, VercelResponse } from '@vercel/node'

function isBlockedUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }

  // Only allow http/https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '[::1]') return true

  // Block private/reserved IPv4 ranges and metadata IPs
  const ipPatterns = [
    /^127\./,                   // loopback
    /^10\./,                    // private class A
    /^172\.(1[6-9]|2\d|3[01])\./, // private class B
    /^192\.168\./,              // private class C
    /^169\.254\./,              // link-local / cloud metadata
    /^0\./,                     // current network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGN
  ]
  if (ipPatterns.some((p) => p.test(hostname))) return true

  // Block common cloud metadata hostnames
  const blockedHosts = ['metadata.google.internal', 'metadata.google', 'instance-data']
  if (blockedHosts.includes(hostname)) return true

  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    const html = await response.text()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to fetch URL: ${message}` })
  }
}
