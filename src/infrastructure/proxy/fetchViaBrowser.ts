/**
 * Fetch a URL's HTML content via the headless browser proxy.
 * Used as a fallback when the normal CORS proxy is blocked by bot protection.
 */
export async function fetchViaBrowser(url: string): Promise<string> {
  const proxyUrl = `/api/proxy-browser?url=${encodeURIComponent(url)}`
  const response = await fetch(proxyUrl)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Browser proxy error: ${(errorData as { error: string }).error || response.statusText}`)
  }

  return response.text()
}
