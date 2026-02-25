import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-ignore -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const maxDuration = 60

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

        const ldBlocks = Array.from(chunk.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
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

  // Fallback: lite.duckduckgo.com table format
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

async function searchViaPuppeteer(searchTerm: string): Promise<string> {
  // @ts-ignore -- chromium typings incomplete
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Wait for results to appear (or timeout after 5s)
    await page.waitForSelector('.result__a', { timeout: 5000 }).catch(() => {})

    return await page.content()
  } finally {
    await browser.close()
  }
}

// Domains that block all datacenter IPs — don't show these in results
const BLOCKED_DOMAINS = [
  'allrecipes.com',
  'foodnetwork.com',
  'food.com',
  'cookinglight.com',
  'eatingwell.com',
  'myrecipes.com',
  'southernliving.com',
  'thekitchn.com',
]

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch { return false }
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

    // Use Puppeteer to fetch DDG results (bypasses CAPTCHA/bot detection)
    const html = await searchViaPuppeteer(searchTerm)
    const results = parseDdgResults(html).filter(r => !isBlockedDomain(r.sourceUrl))

    if (results.length === 0) {
      return res.status(200).json({ results: [] })
    }

    const enriched = await enrichResults(results)
    return res.status(200).json({ results: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Recipe search failed: ${message}` })
  }
}
