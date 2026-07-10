import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

/**
 * Rate limiting for endpoints that spend money on our behalf (LLM inference,
 * Whisper, headless Chromium, partner APIs).
 *
 * These endpoints are intentionally unauthenticated — Mise has no accounts —
 * so the only thing standing between a scraper and the HuggingFace bill is
 * this module.
 *
 * Backed by Vercel KV so the counter is shared across serverless instances.
 * When KV is not configured the limiter degrades to a per-instance in-memory
 * window: weaker (an attacker gets one bucket per warm lambda) but it still
 * blunts a single-source flood, and it keeps local dev working without KV.
 */

interface RateLimitOptions {
  /** Stable name for the endpoint — namespaces the counter. */
  name: string
  /** Requests allowed per IP within the window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
  /**
   * Optional ceiling on total requests across ALL callers per day. Backstops
   * a distributed flood, which per-IP limits cannot see.
   */
  dailyGlobalLimit?: number
  /**
   * Bucket by this identity instead of the client IP. Use for credential
   * guessing, where the thing being protected is an account rather than a
   * caller — otherwise rotating IPs resets the attempt budget.
   */
  subject?: string
}

interface Counter {
  count: number
  resetAt: number
}

const memoryCounters = new Map<string, Counter>()

/** True when the KV connection env vars are present. */
function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * The left-most entry of x-forwarded-for is the client. Vercel appends the
 * real peer address, so this header cannot be trusted for security decisions
 * in general — but for rate limiting, a spoofed value only lets an attacker
 * spread across buckets, which the global ceiling then catches.
 */
export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const first = raw?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

/** Increment a fixed window, returning the post-increment count. */
async function bump(key: string, windowSec: number): Promise<number> {
  if (kvConfigured()) {
    let count: number | null = null
    try {
      count = await kv.incr(key)
    } catch {
      // KV unreachable — fall through to the in-memory window below rather than
      // failing the user's request.
    }

    if (count !== null) {
      // Setting the TTL is best-effort and must not discard the authoritative
      // count: if expire alone fails we'd otherwise fall through and return a
      // per-lambda count of 1, silently undercounting the limiter.
      try {
        // A key with no TTL never resets. That can happen if a previous request
        // was killed between incr and expire, and for failure keys — whose name
        // has no window component — it would lock the subject out permanently.
        if (count === 1 || (await kv.ttl(key)) < 0) {
          await kv.expire(key, windowSec)
        }
      } catch {
        // Leave the count as-is; the next request re-attempts the TTL.
      }
      return count
    }
  }

  const now = Date.now()
  const existing = memoryCounters.get(key)
  if (!existing || existing.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return 1
  }
  existing.count += 1
  return existing.count
}

/** Current UTC day, for keying the global ceiling. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Enforces the limit. Returns true when the caller should proceed.
 *
 * When it returns false it has already sent a 429 — the handler must return
 * immediately without writing to the response.
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  options: RateLimitOptions,
): Promise<boolean> {
  const { name, limit, windowSec, dailyGlobalLimit, subject } = options

  const identity = subject ?? getClientIp(req)
  const window = Math.floor(Date.now() / 1000 / windowSec)
  const key = `rl:${name}:${identity}:${window}`

  const count = await bump(key, windowSec)

  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)))

  if (count > limit) {
    res.setHeader('Retry-After', String(windowSec))
    res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    })
    return false
  }

  if (dailyGlobalLimit) {
    // 24h TTL. Only consulted after the per-IP check passes, so a single
    // hammering client burns its own bucket before touching the global one.
    const globalCount = await bump(`rl:${name}:global:${utcDay()}`, 86_400)
    if (globalCount > dailyGlobalLimit) {
      res.setHeader('Retry-After', '3600')
      res.status(429).json({
        error: 'This feature has hit its daily capacity. Please try again tomorrow.',
      })
      return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Failure counters — for credential guessing.
//
// Distinct from the request limiter above: only *failed* attempts count, and a
// success clears the counter, so a legitimate user who mistypes then succeeds
// isn't penalised. Keyed by subject (the account) rather than IP, since
// rotating IPs must not reset an attacker's budget.
// ---------------------------------------------------------------------------

function failureKey(name: string, subject: string): string {
  return `fail:${name}:${subject}`
}

/** Number of consecutive failures recorded for this subject. */
export async function failureCount(name: string, subject: string): Promise<number> {
  const key = failureKey(name, subject)

  if (kvConfigured()) {
    try {
      const value = await kv.get<number>(key)
      return value ?? 0
    } catch {
      // fall through
    }
  }

  const entry = memoryCounters.get(key)
  if (!entry || entry.resetAt <= Date.now()) return 0
  return entry.count
}

/** Record a failed attempt, starting the lockout window on the first one. */
export async function recordFailure(name: string, subject: string, windowSec: number): Promise<void> {
  await bump(failureKey(name, subject), windowSec)
}

/** Clear the counter after a successful attempt. */
export async function clearFailures(name: string, subject: string): Promise<void> {
  const key = failureKey(name, subject)

  if (kvConfigured()) {
    try {
      await kv.del(key)
      return
    } catch {
      // fall through
    }
  }

  memoryCounters.delete(key)
}
