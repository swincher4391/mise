const PROXY_URL = import.meta.env.VITE_PROXY_URL || ''

/**
 * Fetch a URL's HTML content via the CORS proxy.
 * Falls back to direct fetch if no proxy URL is configured (useful for testing).
 */
export async function fetchViaProxy(url: string): Promise<string> {
  if (!PROXY_URL) {
    // Direct fetch (works for local test files or when served from same origin)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

  const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`
  const response = await fetch(proxyUrl)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Proxy error: ${(errorData as { error: string }).error || response.statusText}`)
  }

  return response.text()
}
