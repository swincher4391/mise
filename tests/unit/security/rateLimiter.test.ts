import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const LOCKOUT_MS = 15 * 60 * 1000

type VerifyHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

interface MockResponse {
  statusCode: number
  body: unknown
  headers: Record<string, unknown>
  setHeader: (name: string, value: unknown) => void
  getHeader: (name: string) => unknown
  status: (code: number) => MockResponse
  json: (payload: unknown) => MockResponse
  end: () => MockResponse
}

function createRequest(email: string, pin: string): VercelRequest {
  return {
    method: 'GET',
    query: { email, pin },
    headers: {},
  } as unknown as VercelRequest
}

function createResponse(): VercelResponse & MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    getHeader(name) {
      return this.headers[name]
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      return this
    },
  }

  return response as VercelResponse & MockResponse
}

async function loadHandler(): Promise<VerifyHandler> {
  vi.resetModules()
  const mod = await import('../../../api/verify-purchase.ts')
  return mod.default as VerifyHandler
}

async function attempt(handler: VerifyHandler, email: string, pin: string) {
  const res = createResponse()
  await handler(createRequest(email, pin), res)
  return res
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.COMPED_EMAILS
})

describe('verify-purchase PIN rate limiting', () => {
  it('locks out after 5 failed attempts', async () => {
    process.env.COMPED_EMAILS = 'user@example.com:1111'
    const handler = await loadHandler()

    for (let i = 0; i < 5; i++) {
      const res = await attempt(handler, 'user@example.com', '9999')
      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ paid: false, email: 'user@example.com' })
    }

    const locked = await attempt(handler, 'user@example.com', '9999')
    expect(locked.statusCode).toBe(429)
    expect(locked.body).toMatchObject({ error: 'Too many PIN attempts. Try again later.' })
  })

  it('clears failed attempt counter after successful PIN', async () => {
    process.env.COMPED_EMAILS = 'user@example.com:1111'
    const handler = await loadHandler()

    for (let i = 0; i < 4; i++) {
      const res = await attempt(handler, 'user@example.com', '9999')
      expect(res.statusCode).toBe(200)
    }

    const success = await attempt(handler, 'user@example.com', '1111')
    expect(success.statusCode).toBe(200)
    expect(success.body).toMatchObject({ paid: true, email: 'user@example.com' })

    for (let i = 0; i < 5; i++) {
      const res = await attempt(handler, 'user@example.com', '9999')
      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ paid: false, email: 'user@example.com' })
    }

    const locked = await attempt(handler, 'user@example.com', '9999')
    expect(locked.statusCode).toBe(429)
  })

  it('removes lockout after TTL expires', async () => {
    process.env.COMPED_EMAILS = 'user@example.com:1111'
    const handler = await loadHandler()

    for (let i = 0; i < 6; i++) {
      await attempt(handler, 'user@example.com', '9999')
    }

    const locked = await attempt(handler, 'user@example.com', '9999')
    expect(locked.statusCode).toBe(429)

    vi.advanceTimersByTime(LOCKOUT_MS + 1)

    const afterTtl = await attempt(handler, 'user@example.com', '9999')
    expect(afterTtl.statusCode).toBe(200)
    expect(afterTtl.body).toMatchObject({ paid: false, email: 'user@example.com' })
  })

  it('tracks failed attempts independently per email', async () => {
    process.env.COMPED_EMAILS = 'first@example.com:1111,second@example.com:2222'
    const handler = await loadHandler()

    for (let i = 0; i < 6; i++) {
      await attempt(handler, 'first@example.com', '9999')
    }

    const firstLocked = await attempt(handler, 'first@example.com', '9999')
    expect(firstLocked.statusCode).toBe(429)

    const second = await attempt(handler, 'second@example.com', '9999')
    expect(second.statusCode).toBe(200)
    expect(second.body).toMatchObject({ paid: false, email: 'second@example.com' })
  })
})
