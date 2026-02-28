import { db } from './database.ts'

export interface CachedExtraction {
  canonicalUrl: string
  extractedAt: number
  transcript: string | null
  ocrText: string | null
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Normalize URL for cache key: strip tracking params, lowercase host */
function canonicalize(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    u.searchParams.delete('igshid')
    u.searchParams.delete('igsh')
    u.hash = ''
    return u.toString()
  } catch {
    return url
  }
}

export async function getCachedExtraction(url: string): Promise<CachedExtraction | null> {
  const key = canonicalize(url)
  const entry = await db.extractionCache.get(key)
  if (!entry) return null

  // Expire stale entries
  if (Date.now() - entry.extractedAt > CACHE_TTL_MS) {
    await db.extractionCache.delete(key)
    return null
  }

  return entry
}

export async function cacheExtraction(
  url: string,
  result: { transcript: string | null; ocrText: string | null }
): Promise<void> {
  const key = canonicalize(url)
  await db.extractionCache.put({
    canonicalUrl: key,
    extractedAt: Date.now(),
    transcript: result.transcript,
    ocrText: result.ocrText,
  })
}
