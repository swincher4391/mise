import { lookup } from 'dns/promises'

/** IPv4 patterns that should never be reachable via the proxy. */
const BLOCKED_IP_PATTERNS = [
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

const BLOCKED_HOSTS = ['metadata.google.internal', 'metadata.google', 'instance-data']

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((p) => p.test(ip))
}

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
  if (hostname === 'localhost') return true

  // Block all IPv6 literal addresses — covers [::1], [::ffff:127.0.0.1],
  // [::ffff:a9fe:a9fe] (169.254.x), and all other mapped/embedded bypasses.
  // Recipe sites never serve content over IPv6 literals.
  if (hostname.startsWith('[')) return true

  if (isBlockedIp(hostname)) return true

  if (BLOCKED_HOSTS.includes(hostname)) return true

  return false
}

/**
 * Resolves the hostname to an IP and checks the resolved address against
 * the blocklist. Prevents DNS rebinding attacks where an attacker-controlled
 * domain resolves to a private/reserved IP at fetch time.
 */
export async function isBlockedAfterResolve(raw: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }

  const hostname = parsed.hostname.toLowerCase()

  // Skip resolution for IPs — already checked by isBlockedUrl
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false

  try {
    const { address } = await lookup(hostname)
    return isBlockedIp(address)
  } catch {
    // DNS resolution failed — block to be safe
    return true
  }
}
