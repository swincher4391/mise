/**
 * KV-path behaviour of the rate limiter.
 *
 * The failure-counter key (`fail:pin:<email>`) has no window component, so its
 * TTL is the ONLY thing that ever resets it. If a request dies between INCR and
 * EXPIRE, the key persists forever and the subject is locked out permanently.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const kv = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}

vi.mock('@vercel/kv', () => ({ kv }))

async function load() {
  vi.resetModules()
  return import('../../../api/_lib/rateLimit.ts')
}

beforeEach(() => {
  Object.values(kv).forEach((fn) => fn.mockReset())
  process.env.KV_REST_API_URL = 'https://kv.example'
  process.env.KV_REST_API_TOKEN = 'token'
})

describe('rate limiter — KV path', () => {
  it('sets a TTL when it creates the key', async () => {
    const { recordFailure } = await load()
    kv.incr.mockResolvedValue(1)
    kv.expire.mockResolvedValue(1)

    await recordFailure('pin', 'a@b.com', 900)

    expect(kv.expire).toHaveBeenCalledWith('fail:pin:a@b.com', 900)
  })

  // The permanent-lockout scenario: a previous request was killed after INCR
  // but before EXPIRE, leaving a key with TTL -1 that never resets.
  it('repairs a key that exists with no TTL', async () => {
    const { recordFailure } = await load()
    kv.incr.mockResolvedValue(3) // not the creating request
    kv.ttl.mockResolvedValue(-1) // exists, no expiry
    kv.expire.mockResolvedValue(1)

    await recordFailure('pin', 'a@b.com', 900)

    expect(kv.ttl).toHaveBeenCalledWith('fail:pin:a@b.com')
    expect(kv.expire).toHaveBeenCalledWith('fail:pin:a@b.com', 900)
  })

  it('leaves an existing healthy TTL alone', async () => {
    const { recordFailure } = await load()
    kv.incr.mockResolvedValue(2)
    kv.ttl.mockResolvedValue(600) // still counting down

    await recordFailure('pin', 'a@b.com', 900)

    expect(kv.expire).not.toHaveBeenCalled()
  })

  // If EXPIRE fails we must still return the authoritative KV count. Falling
  // through to the per-lambda memory counter would return 1 and admit a request
  // that should have been rejected.
  it('keeps the KV count when only expire fails', async () => {
    const { enforceRateLimit } = await load()
    kv.incr.mockResolvedValue(61)
    kv.ttl.mockResolvedValue(-1)
    kv.expire.mockRejectedValue(new Error('KV down'))

    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(k: string, v: unknown) { this.headers[k] = v },
      getHeader(k: string) { return this.headers[k] },
      status(c: number) { this.statusCode = c; return this },
      json() { return this },
    }
    const req: any = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} }

    const allowed = await enforceRateLimit(req, res, { name: 'proxy', limit: 60, windowSec: 600 })

    expect(allowed).toBe(false)
    expect(res.statusCode).toBe(429)
  })

  it('falls back to the in-memory window when incr itself fails', async () => {
    const { enforceRateLimit } = await load()
    kv.incr.mockRejectedValue(new Error('KV down'))

    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(k: string, v: unknown) { this.headers[k] = v },
      getHeader(k: string) { return this.headers[k] },
      status(c: number) { this.statusCode = c; return this },
      json() { return this },
    }
    const req: any = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} }

    // Degrades rather than failing the user's request.
    expect(await enforceRateLimit(req, res, { name: 'proxy', limit: 2, windowSec: 600 })).toBe(true)
    expect(await enforceRateLimit(req, res, { name: 'proxy', limit: 2, windowSec: 600 })).toBe(true)
    expect(await enforceRateLimit(req, res, { name: 'proxy', limit: 2, windowSec: 600 })).toBe(false)
  })

  it('clears failures via kv.del', async () => {
    const { clearFailures } = await load()
    kv.del.mockResolvedValue(1)

    await clearFailures('pin', 'a@b.com')

    expect(kv.del).toHaveBeenCalledWith('fail:pin:a@b.com')
  })
})
