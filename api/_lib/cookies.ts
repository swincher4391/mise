import type { VercelRequest, VercelResponse } from '@vercel/node'
import { encrypt, decrypt } from './crypto.js'

const COOKIE_NAME = 'kroger_session'
const STATE_COOKIE = 'kroger_oauth_state'

export interface KrogerSession {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

/** Append a Set-Cookie header without overwriting existing ones */
function appendCookie(res: VercelResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie')
  if (!existing) {
    res.setHeader('Set-Cookie', [cookie])
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie])
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookie])
  }
}

export function setTokenCookie(res: VercelResponse, session: KrogerSession): void {
  const payload = encrypt(JSON.stringify(session))
  const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
  appendCookie(res, `${COOKIE_NAME}=${payload}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${maxAge}`)
}

export function getTokenFromCookie(req: VercelRequest): KrogerSession | null {
  const cookies = parseCookies(req.headers.cookie ?? '')
  const raw = cookies[COOKIE_NAME]
  if (!raw) return null
  try {
    const session: KrogerSession = JSON.parse(decrypt(raw))
    if (Date.now() > session.expiresAt) return null
    return session
  } catch {
    return null
  }
}

export function clearTokenCookie(res: VercelResponse): void {
  appendCookie(res, `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0`)
}

export function setStateCookie(res: VercelResponse, state: string): void {
  appendCookie(res, `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`)
}

export function getStateCookie(req: VercelRequest): string | null {
  const cookies = parseCookies(req.headers.cookie ?? '')
  return cookies[STATE_COOKIE] ?? null
}

export function clearStateCookie(res: VercelResponse): void {
  appendCookie(res, `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    result[key] = value
  }
  return result
}
