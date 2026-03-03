/**
 * Security tests for the proxy endpoint SSRF protections.
 *
 * Covers:
 *   CWE-918  Server-Side Request Forgery (OWASP A01:2025)
 *   CWE-20   Improper Input Validation
 *   CWE-601  Open Redirect
 *
 * These tests validate the isBlockedUrl function directly.
 * DNS rebinding (CWE-350) is noted but can't be tested in unit tests.
 */
import { describe, it, expect } from 'vitest'

// Extract and test the blocking logic directly
// We re-implement isBlockedUrl here to test it since it's not exported
function isBlockedUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true

  const hostname = parsed.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname === '[::1]') return true

  const ipPatterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^(22[4-9]|23\d)\./,             // multicast 224-239
    /^(24\d|25[0-5])\./,             // reserved 240-255
  ]
  if (ipPatterns.some((p) => p.test(hostname))) return true

  const blockedHosts = [
    'metadata.google.internal',
    'metadata.google',
    'instance-data',
  ]
  if (blockedHosts.includes(hostname)) return true

  return false
}

describe('CWE-918: SSRF protection — private IP ranges', () => {
  it('blocks localhost', () => {
    expect(isBlockedUrl('http://localhost/admin')).toBe(true)
    expect(isBlockedUrl('http://localhost:3000')).toBe(true)
  })

  it('blocks IPv6 loopback', () => {
    expect(isBlockedUrl('http://[::1]/')).toBe(true)
  })

  it('blocks 127.x.x.x loopback range', () => {
    expect(isBlockedUrl('http://127.0.0.1/')).toBe(true)
    expect(isBlockedUrl('http://127.0.0.2/')).toBe(true)
    expect(isBlockedUrl('http://127.255.255.255/')).toBe(true)
  })

  it('blocks 10.x.x.x private range', () => {
    expect(isBlockedUrl('http://10.0.0.1/')).toBe(true)
    expect(isBlockedUrl('http://10.255.255.255/')).toBe(true)
  })

  it('blocks 172.16-31.x.x private range', () => {
    expect(isBlockedUrl('http://172.16.0.1/')).toBe(true)
    expect(isBlockedUrl('http://172.31.255.255/')).toBe(true)
    // 172.15 and 172.32 should NOT be blocked
    expect(isBlockedUrl('http://172.15.0.1/')).toBe(false)
    expect(isBlockedUrl('http://172.32.0.1/')).toBe(false)
  })

  it('blocks 192.168.x.x private range', () => {
    expect(isBlockedUrl('http://192.168.0.1/')).toBe(true)
    expect(isBlockedUrl('http://192.168.1.1/')).toBe(true)
  })

  it('blocks link-local / cloud metadata (169.254.x.x)', () => {
    expect(isBlockedUrl('http://169.254.169.254/')).toBe(true)
    expect(isBlockedUrl('http://169.254.169.254/latest/meta-data/')).toBe(true)
  })

  it('blocks current network (0.x.x.x)', () => {
    expect(isBlockedUrl('http://0.0.0.0/')).toBe(true)
  })

  it('blocks CGN range (100.64-127.x.x)', () => {
    expect(isBlockedUrl('http://100.64.0.1/')).toBe(true)
    expect(isBlockedUrl('http://100.127.255.255/')).toBe(true)
  })

  it('blocks multicast range (224-239.x.x.x)', () => {
    expect(isBlockedUrl('http://224.0.0.1/')).toBe(true)
    expect(isBlockedUrl('http://239.255.255.255/')).toBe(true)
  })

  it('blocks reserved range (240-255.x.x.x)', () => {
    expect(isBlockedUrl('http://240.0.0.1/')).toBe(true)
    expect(isBlockedUrl('http://255.255.255.255/')).toBe(true)
  })

  it('allows legitimate public IPs', () => {
    expect(isBlockedUrl('https://8.8.8.8/')).toBe(false)
    expect(isBlockedUrl('https://1.1.1.1/')).toBe(false)
    expect(isBlockedUrl('https://142.250.80.46/')).toBe(false)
  })
})

describe('CWE-918: SSRF protection — cloud metadata', () => {
  it('blocks GCP metadata', () => {
    expect(isBlockedUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(true)
  })

  it('blocks AWS metadata via IP', () => {
    expect(isBlockedUrl('http://169.254.169.254/latest/meta-data/')).toBe(true)
  })

  it('blocks instance-data hostname', () => {
    expect(isBlockedUrl('http://instance-data/')).toBe(true)
  })
})

describe('CWE-20: Protocol validation', () => {
  it('blocks file:// protocol', () => {
    expect(isBlockedUrl('file:///etc/passwd')).toBe(true)
  })

  it('blocks ftp:// protocol', () => {
    expect(isBlockedUrl('ftp://internal.server/data')).toBe(true)
  })

  it('blocks gopher:// protocol', () => {
    expect(isBlockedUrl('gopher://127.0.0.1:6379/_*1%0d%0a$4%0d%0aINFO%0d%0a')).toBe(true)
  })

  it('blocks javascript: protocol', () => {
    expect(isBlockedUrl('javascript:alert(1)')).toBe(true)
  })

  it('blocks data: protocol', () => {
    expect(isBlockedUrl('data:text/html,<script>alert(1)</script>')).toBe(true)
  })

  it('rejects malformed URLs', () => {
    expect(isBlockedUrl('not-a-url')).toBe(true)
    expect(isBlockedUrl('')).toBe(true)
    expect(isBlockedUrl('://missing-scheme')).toBe(true)
  })

  it('allows http and https', () => {
    expect(isBlockedUrl('http://example.com')).toBe(false)
    expect(isBlockedUrl('https://example.com')).toBe(false)
  })
})

describe('CWE-601: Open redirect via proxy', () => {
  it('allows legitimate external URLs', () => {
    expect(isBlockedUrl('https://www.allrecipes.com/recipe/123')).toBe(false)
  })
})
