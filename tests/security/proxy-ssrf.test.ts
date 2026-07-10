/**
 * Security tests for the proxy endpoint SSRF protections.
 *
 * Covers:
 *   CWE-918  Server-Side Request Forgery (OWASP A01:2025)
 *   CWE-20   Improper Input Validation
 *   CWE-601  Open Redirect
 *   CWE-350  DNS Rebinding
 *
 * Tests validate isBlockedUrl and isBlockedAfterResolve from the shared
 * ssrf module used by proxy.ts, proxy-browser.ts, and videoCapture.ts.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lookup } from 'dns/promises'

vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}))

const mockLookup = vi.mocked(lookup)

import { isBlockedUrl, isBlockedAfterResolve } from '../../api/_lib/ssrf.js'

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

describe('CWE-918: SSRF protection — IPv6-mapped address bypass', () => {
  it('blocks IPv6-mapped 169.254.x (cloud metadata)', () => {
    expect(isBlockedUrl('http://[::ffff:a9fe:a9fe]/')).toBe(true)
  })

  it('blocks IPv6-mapped 127.0.0.1 (loopback)', () => {
    expect(isBlockedUrl('http://[::ffff:7f00:1]/')).toBe(true)
  })

  it('blocks IPv6-mapped 10.x (private class A)', () => {
    expect(isBlockedUrl('http://[::ffff:a00:1]/')).toBe(true)
  })

  it('blocks IPv6-mapped 192.168.x (private class C)', () => {
    expect(isBlockedUrl('http://[::ffff:c0a8:1]/')).toBe(true)
  })

  it('blocks arbitrary IPv6 literal addresses', () => {
    expect(isBlockedUrl('http://[fe80::1]/')).toBe(true)
    expect(isBlockedUrl('http://[2001:db8::1]/')).toBe(true)
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

describe('CWE-350: DNS rebinding protection — isBlockedAfterResolve', () => {
  beforeEach(() => {
    mockLookup.mockReset()
  })

  it('blocks domain resolving to loopback', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks domain resolving to cloud metadata IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks domain resolving to private class A', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks domain resolving to private class B', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '172.16.0.1', family: 4 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks domain resolving to private class C', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks when DNS resolution fails', async () => {
    mockLookup.mockRejectedValueOnce(new Error('ENOTFOUND'))
    expect(await isBlockedAfterResolve('http://nonexistent.invalid/')).toBe(true)
  })

  it('allows domain resolving to public IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '142.250.80.46', family: 4 }] as never)
    expect(await isBlockedAfterResolve('https://www.allrecipes.com/')).toBe(false)
  })

  it('skips DNS resolution for literal IPs (already checked by isBlockedUrl)', async () => {
    await isBlockedAfterResolve('http://8.8.8.8/')
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('blocks malformed URLs', async () => {
    expect(await isBlockedAfterResolve('not-a-url')).toBe(true)
  })
})

/**
 * A hostname resolving to IPv6 bypassed the IPv4-only blocklist entirely:
 * isBlockedUrl only rejects IPv6 *literals*, not names that resolve to IPv6.
 */
describe('CWE-918: SSRF protection — IPv6 resolutions', () => {
  beforeEach(() => {
    mockLookup.mockReset()
  })

  it('blocks a domain resolving to IPv6 loopback', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '::1', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks IPv4-mapped loopback in dotted form', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '::ffff:127.0.0.1', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks IPv4-mapped cloud metadata in hex-quad form', async () => {
    // ::ffff:a9fe:a9fe === 169.254.169.254
    mockLookup.mockResolvedValueOnce([{ address: '::ffff:a9fe:a9fe', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks unique-local (fc00::/7) addresses', async () => {
    mockLookup.mockResolvedValueOnce([{ address: 'fd12:3456::1', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks link-local (fe80::/10) addresses, including a zone index', async () => {
    mockLookup.mockResolvedValueOnce([{ address: 'fe80::1%eth0', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks NAT64-embedded metadata', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '64:ff9b::169.254.169.254', family: 6 }] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('allows a public IPv6 address', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '2607:f8b0:4004:c07::71', family: 6 }] as never)
    expect(await isBlockedAfterResolve('https://www.allrecipes.com/')).toBe(false)
  })

  it('allows a legitimate dual-stack host', async () => {
    mockLookup.mockResolvedValueOnce([
      { address: '142.250.80.46', family: 4 },
      { address: '2607:f8b0:4004:c07::71', family: 6 },
    ] as never)
    expect(await isBlockedAfterResolve('https://www.allrecipes.com/')).toBe(false)
  })

  // The whole point of resolving every record rather than just the first.
  it('blocks when any record in a multi-record answer is private', async () => {
    mockLookup.mockResolvedValueOnce([
      { address: '142.250.80.46', family: 4 },
      { address: '::1', family: 6 },
    ] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })

  it('blocks an empty DNS answer', async () => {
    mockLookup.mockResolvedValueOnce([] as never)
    expect(await isBlockedAfterResolve('http://evil.com/')).toBe(true)
  })
})
