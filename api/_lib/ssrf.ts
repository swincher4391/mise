/**
 * Shared SSRF protection — validates URLs against a blocklist of
 * private/reserved IP ranges, localhost, and cloud metadata endpoints.
 */
export function isBlockedUrl(raw: string): boolean {
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
    /^(22[4-9]|23\d)\./,       // multicast (224-239)
    /^(24\d|25[0-5])\./,       // reserved (240-255)
  ]
  if (ipPatterns.some((p) => p.test(hostname))) return true

  // Block common cloud metadata hostnames
  if (['metadata.google.internal', 'metadata.google', 'instance-data'].includes(hostname))
    return true

  return false
}
