import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 30

async function enrichResults(
  results: Array<{ title: string; sourceUrl: string; sourceName: string; description: string; image: string | null; rating: number | null; ratingCount: number | null }>
) {
  const enriched = await Promise.allSettled(
    results.map(async (r) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(r.sourceUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        })
        const text = await res.text()
        const chunk = text.slice(0, 100_000)

        const ldBlocks = [...chunk.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
        for (const match of ldBlocks) {
          try {
            const ld = JSON.parse(match[1])
            const recipes = Array.isArray(ld) ? ld : ld['@graph'] ? ld['@graph'] : [ld]
            for (const item of recipes) {
              if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
                if (!r.image && item.image) {
                  const img = Array.isArray(item.image) ? item.image[0] : item.image
                  r.image = typeof img === 'string' ? img : img?.url ?? null
                }
                if (item.aggregateRating) {
                  const ar = item.aggregateRating
                  r.rating = parseFloat(ar.ratingValue) || null
                  r.ratingCount = parseInt(ar.ratingCount || ar.reviewCount, 10) || null
                }
                break
              }
            }
          } catch { /* skip bad JSON-LD */ }
        }

        if (!r.image) {
          const ogMatch = chunk.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            ?? chunk.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
          if (ogMatch) r.image = ogMatch[1]
        }
      } catch { /* timeout or fetch error */ } finally {
        clearTimeout(timeout)
      }
      return r
    })
  )

  return enriched.map((r, i) => r.status === 'fulfilled' ? r.value : results[i])
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDdgResults(html: string) {
  const results: Array<{
    title: string
    sourceUrl: string
    sourceName: string
    description: string
    image: string | null
    rating: number | null
    ratingCount: number | null
  }> = []

  // Try standard html.duckduckgo.com format first
  const blocks = html.split(/class="result\s/)
  if (blocks.length > 1) {
    for (const block of blocks.slice(1)) {
      if (block.includes('result--ad')) continue

      const titleMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
      if (!titleMatch) continue

      const rawHref = titleMatch[1]
      const rawTitle = decodeHtmlEntities(titleMatch[2].replace(/<[^>]*>/g, ''))
      if (!rawTitle) continue

      let sourceUrl: string
      const uddgMatch = rawHref.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        sourceUrl = decodeURIComponent(uddgMatch[1])
      } else if (rawHref.startsWith('http')) {
        sourceUrl = rawHref
      } else {
        continue
      }

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      const description = snippetMatch
        ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]*>/g, '')).slice(0, 200)
        : ''

      const urlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)</)
      const sourceName = urlMatch
        ? urlMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, '').split('/')[0]
        : (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { return '' } })()

      results.push({ title: rawTitle, sourceUrl, sourceName, description, image: null, rating: null, ratingCount: null })
      if (results.length >= 12) break
    }
    return results
  }

  // Fallback: lite.duckduckgo.com format
  const rows = html.split(/<tr>/)
  for (const row of rows) {
    const linkMatch = row.match(/<a[^>]*href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/)
    if (!linkMatch) continue

    const sourceUrl = linkMatch[1]
    if (!sourceUrl.startsWith('http')) continue
    const rawTitle = decodeHtmlEntities(linkMatch[2].replace(/<[^>]*>/g, ''))
    if (!rawTitle) continue

    const snippetMatch = row.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/)
    const description = snippetMatch
      ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]*>/g, '')).slice(0, 200)
      : ''

    const sourceName = (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { return '' } })()

    results.push({ title: rawTitle, sourceUrl, sourceName, description, image: null, rating: null, ratingCount: null })
    if (results.length >= 12) break
  }

  return results
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = req.query.q
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing ?q= parameter' })
  }

  try {
    const searchTerm = query + ' recipe'
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

    // Try standard HTML endpoint first, fall back to lite
    let html = ''
    const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`, {
      headers: { 'User-Agent': ua },
    })

    if (htmlRes.ok) {
      html = await htmlRes.text()
    } else {
      const liteRes = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
          'User-Agent': ua,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encodeURIComponent(searchTerm)}`,
      })
      if (!liteRes.ok) {
        return res.status(502).json({ error: `Search failed (${liteRes.status})` })
      }
      html = await liteRes.text()
    }

    const results = parseDdgResults(html)
    const enriched = await enrichResults(results)

    return res.status(200).json({ results: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Recipe search failed: ${message}` })
  }
}
