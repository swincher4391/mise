import { describe, expect, it } from 'vitest'
import type { VercelRequest } from '@vercel/node'
import { isAllowedOrigin } from '../../../api/_lib/cors.ts'

function req(headers: Record<string, string | undefined>): VercelRequest {
  return { headers } as unknown as VercelRequest
}

describe('isAllowedOrigin', () => {
  it('allows requests with no Origin (curl, server-to-server)', () => {
    expect(isAllowedOrigin(req({}))).toBe(true)
  })

  it('allows the production origin', () => {
    expect(isAllowedOrigin(req({ origin: 'https://mise.swinch.dev' }))).toBe(true)
  })

  it('allows same-origin requests from a preview deployment', () => {
    expect(isAllowedOrigin(req({
      origin: 'https://mise-git-branch.vercel.app',
      host: 'mise-git-branch.vercel.app',
    }))).toBe(true)
  })

  it('allows same-origin requests from local dev', () => {
    expect(isAllowedOrigin(req({
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
    }))).toBe(true)
  })

  it('rejects a foreign origin', () => {
    expect(isAllowedOrigin(req({
      origin: 'https://evil.example',
      host: 'mise.swinch.dev',
    }))).toBe(false)
  })

  it('rejects an origin that merely embeds the host', () => {
    expect(isAllowedOrigin(req({
      origin: 'https://mise.swinch.dev.evil.example',
      host: 'mise.swinch.dev',
    }))).toBe(false)
  })

  it('rejects a malformed Origin header', () => {
    expect(isAllowedOrigin(req({ origin: 'not a url', host: 'mise.swinch.dev' }))).toBe(false)
  })
})
