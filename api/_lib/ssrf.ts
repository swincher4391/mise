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

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some((p) => p.test(ip))
}

/**
 * IPv6 equivalents of the v4 blocklist.
 *
 * A hostname with only an AAAA record bypasses the v4 patterns entirely, so a
 * resolved IPv6 address must be checked on its own terms. Note this is about
 * *resolved* addresses — IPv6 literals in URLs are rejected outright by
 * isBlockedUrl.
 */
function isBlockedIpv6(raw: string): boolean {
  // Strip any zone index (fe80::1%eth0) and normalize.
  const ip = raw.toLowerCase().split('%')[0]

  if (ip === '::1' || ip === '::') return true

  // IPv4-mapped (::ffff:127.0.0.1) and NAT64 (64:ff9b::169.254.169.254) embed a
  // v4 address — pull it out and apply the v4 rules.
  const embedded = ip.match(/(?:::ffff:|^64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
  if (embedded) return isBlockedIpv4(embedded[1])

  // Same, written as hex quads: ::ffff:7f00:1
  const hexMapped = ip.match(/(?:::ffff:|^64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped) {
    const high = parseInt(hexMapped[1], 16)
    const low = parseInt(hexMapped[2], 16)
    const dotted = `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
    return isBlockedIpv4(dotted)
  }

  if (/^f[cd]/.test(ip)) return true        // fc00::/7 unique local
  if (/^fe[89ab]/.test(ip)) return true     // fe80::/10 link-local

  return false
}

function isBlockedIp(ip: string): boolean {
  return ip.includes(':') ? isBlockedIpv6(ip) : isBlockedIpv4(ip)
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
    // Resolve every record, not just the first: a host with one public A record
    // and one private AAAA record would otherwise slip through, and Node may
    // connect to either. A dual-stack host with only public addresses passes.
    const results = await lookup(hostname, { all: true })
    if (results.length === 0) return true
    return results.some(({ address }) => isBlockedIp(address))
  } catch {
    // DNS resolution failed — block to be safe
    return true
  }
}
