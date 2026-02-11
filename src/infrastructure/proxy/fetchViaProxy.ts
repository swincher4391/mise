const PROXY_URL = import.meta.env.VITE_PROXY_URL || ''

/**
 * Fetch a URL's HTML content via the CORS proxy.
 * In dev mode (no VITE_PROXY_URL), uses the Vite dev server proxy at /api/proxy.
 * In production, uses the configured Cloudflare Worker proxy URL.
 */
export async function fetchViaProxy(url: string): Promise<string> {
  const base = PROXY_URL || '/api/proxy'
  const proxyUrl = `${base}?url=${encodeURIComponent(url)}`
  const response = await fetch(proxyUrl)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Proxy error: ${(errorData as { error: string }).error || response.statusText}`)
  }

  return response.text()
}
