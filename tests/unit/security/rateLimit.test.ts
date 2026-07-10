/**
 * Rate limiter behaviour on the in-memory path (KV env vars absent), which is
 * what local dev and any KV outage fall back to.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

async function load() {
  vi.resetModules()
  return import('../../../api/_lib/rateLimit.ts')
}

function req(ip = '1.2.3.4'): VercelRequest {
  return { headers: { 'x-forwarded-for': ip }, socket: {} } as unknown as VercelRequest
}

function res() {
  const r: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
    setHeader(k: string, v: unknown) { this.headers[k] = v },
    getHeader(k: string) { return this.headers[k] },
    status(c: number) { this.statusCode = c; return this },
    json(p: unknown) { this.body = p; return this },
    end() { return this },
  }
  return r as VercelResponse & typeof r
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
})

afterEach(() => vi.useRealTimers())

describe('enforceRateLimit', () => {
  it('allows up to the limit, then rejects with 429 and Retry-After', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'test', limit: 3, windowSec: 60 }

    for (let i = 0; i < 3; i++) {
      const r = res()
      expect(await enforceRateLimit(req(), r, opts)).toBe(true)
      expect(r.statusCode).toBe(200)
    }

    const blocked = res()
    expect(await enforceRateLimit(req(), blocked, opts)).toBe(false)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.getHeader('Retry-After')).toBe('60')
  })

  it('reports remaining budget in headers', async () => {
    const { enforceRateLimit } = await load()
    const r = res()
    await enforceRateLimit(req(), r, { name: 'test', limit: 5, windowSec: 60 })
    expect(r.getHeader('X-RateLimit-Limit')).toBe('5')
    expect(r.getHeader('X-RateLimit-Remaining')).toBe('4')
  })

  it('buckets separately per client IP', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'test', limit: 1, windowSec: 60 }

    expect(await enforceRateLimit(req('1.1.1.1'), res(), opts)).toBe(true)
    expect(await enforceRateLimit(req('1.1.1.1'), res(), opts)).toBe(false)
    // A different caller is unaffected.
    expect(await enforceRateLimit(req('2.2.2.2'), res(), opts)).toBe(true)
  })

  it('takes only the left-most x-forwarded-for entry', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'test', limit: 1, windowSec: 60 }

    expect(await enforceRateLimit(req('9.9.9.9, 10.0.0.1'), res(), opts)).toBe(true)
    // Same client, different proxy chain suffix — must land in the same bucket.
    expect(await enforceRateLimit(req('9.9.9.9, 172.16.0.9'), res(), opts)).toBe(false)
  })

  it('resets once the window elapses', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'test', limit: 1, windowSec: 60 }

    expect(await enforceRateLimit(req(), res(), opts)).toBe(true)
    expect(await enforceRateLimit(req(), res(), opts)).toBe(false)

    vi.advanceTimersByTime(60_000)
    expect(await enforceRateLimit(req(), res(), opts)).toBe(true)
  })

  it('enforces a daily global ceiling across distinct IPs', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'test', limit: 100, windowSec: 60, dailyGlobalLimit: 2 }

    expect(await enforceRateLimit(req('1.1.1.1'), res(), opts)).toBe(true)
    expect(await enforceRateLimit(req('2.2.2.2'), res(), opts)).toBe(true)

    const blocked = res()
    expect(await enforceRateLimit(req('3.3.3.3'), blocked, opts)).toBe(false)
    expect(blocked.statusCode).toBe(429)
  })

  it('buckets by subject instead of IP when given one', async () => {
    const { enforceRateLimit } = await load()
    const opts = { name: 'pin', subject: 'a@b.com', limit: 1, windowSec: 60 }

    expect(await enforceRateLimit(req('1.1.1.1'), res(), opts)).toBe(true)
    // Rotating IPs must not reset the budget for the same subject.
    expect(await enforceRateLimit(req('9.9.9.9'), res(), opts)).toBe(false)
  })
})

describe('failure counters', () => {
  it('counts only recorded failures and clears on success', async () => {
    const { failureCount, recordFailure, clearFailures } = await load()

    expect(await failureCount('pin', 'a@b.com')).toBe(0)

    await recordFailure('pin', 'a@b.com', 900)
    await recordFailure('pin', 'a@b.com', 900)
    expect(await failureCount('pin', 'a@b.com')).toBe(2)

    await clearFailures('pin', 'a@b.com')
    expect(await failureCount('pin', 'a@b.com')).toBe(0)
  })

  it('expires the lockout window', async () => {
    const { failureCount, recordFailure } = await load()

    await recordFailure('pin', 'a@b.com', 900)
    expect(await failureCount('pin', 'a@b.com')).toBe(1)

    vi.advanceTimersByTime(900_000 + 1)
    expect(await failureCount('pin', 'a@b.com')).toBe(0)
  })

  it('tracks subjects independently', async () => {
    const { failureCount, recordFailure } = await load()

    await recordFailure('pin', 'first@b.com', 900)
    expect(await failureCount('pin', 'first@b.com')).toBe(1)
    expect(await failureCount('pin', 'second@b.com')).toBe(0)
  })
})
