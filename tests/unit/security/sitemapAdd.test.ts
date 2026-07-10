/**
 * The sitemap POST is unauthenticated by necessity (the client calls it when a
 * user shares). These tests pin the guards that replace authentication.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { gzipSync } from 'node:zlib'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// The handler imports @vercel/kv at module scope; stub it so no network is used.
const zadd = vi.fn()
vi.mock('@vercel/kv', () => ({
  kv: {
    zcard: vi.fn(async () => 0),
    zadd: (...args: unknown[]) => zadd(...args),
    zremrangebyrank: vi.fn(async () => 0),
    zrange: vi.fn(async () => []),
    del: vi.fn(async () => 0),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    get: vi.fn(async () => null),
  },
}))

function encode(value: unknown): string {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const VALID = encode({ t: 'Roast Chicken', ig: ['1 chicken'], st: ['Roast it'] })

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
    setHeader(k: string, v: unknown) { this.headers[k] = v },
    getHeader(k: string) { return this.headers[k] },
    status(c: number) { this.statusCode = c; return this },
    json(p: unknown) { this.body = p; return this },
    send(p: unknown) { this.body = p; return this },
    end() { return this },
  }
  return res as VercelResponse & typeof res
}

function post(headers: Record<string, string>, body: unknown): VercelRequest {
  return { method: 'POST', headers, body, query: {} } as unknown as VercelRequest
}

async function loadHandler() {
  vi.resetModules()
  const mod = await import('../../../api/sitemap-xml.ts')
  return mod.default
}

beforeEach(() => {
  zadd.mockClear()
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
})

describe('POST /api/sitemap-xml', () => {
  it('accepts a valid recipe payload from the app itself', async () => {
    const handler = await loadHandler()
    const res = createResponse()
    await handler(post({ origin: 'https://mise.swinch.dev', host: 'mise.swinch.dev' }, { d: VALID }), res)

    expect(res.statusCode).toBe(200)
    expect(zadd).toHaveBeenCalledOnce()
  })

  it('accepts a same-origin write from a preview deployment', async () => {
    const handler = await loadHandler()
    const res = createResponse()
    await handler(post({ origin: 'https://preview.vercel.app', host: 'preview.vercel.app' }, { d: VALID }), res)

    expect(res.statusCode).toBe(200)
  })

  it('rejects a foreign origin', async () => {
    const handler = await loadHandler()
    const res = createResponse()
    await handler(post({ origin: 'https://evil.example', host: 'mise.swinch.dev' }, { d: VALID }), res)

    expect(res.statusCode).toBe(403)
    expect(zadd).not.toHaveBeenCalled()
  })

  // The old handler stored any string <=12KB, so anyone could inject arbitrary
  // <loc> entries into the public sitemap under our domain.
  it('rejects an arbitrary blob that is not a recipe', async () => {
    const handler = await loadHandler()
    const res = createResponse()
    await handler(post({ origin: 'https://mise.swinch.dev', host: 'mise.swinch.dev' }, { d: 'not-a-recipe' }), res)

    expect(res.statusCode).toBe(400)
    expect(zadd).not.toHaveBeenCalled()
  })

  it('rejects a well-formed gzip payload that lacks a title', async () => {
    const handler = await loadHandler()
    const res = createResponse()
    await handler(post({ origin: 'https://mise.swinch.dev', host: 'mise.swinch.dev' }, { d: encode({ ig: [] }) }), res)

    expect(res.statusCode).toBe(400)
    expect(zadd).not.toHaveBeenCalled()
  })
})
