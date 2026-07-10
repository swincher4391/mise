import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Allowed origins for cookie-authenticated endpoints.
 * Falls back to wildcard only for truly public endpoints.
 */
export const ALLOWED_ORIGINS = [
  'https://mise.swinch.dev',
  'https://mise-recipe.vercel.app',
]

/**
 * True when the request has no Origin (curl, server-to-server), comes from an
 * allowlisted production origin, or is same-origin as the deployment itself.
 *
 * The same-origin case matters because browsers send Origin on every POST, so a
 * bare allowlist would reject the app's own writes from localhost and from
 * Vercel preview deployments.
 */
export function isAllowedOrigin(req: VercelRequest): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true

  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/** Set restrictive CORS headers for endpoints that use cookies */
export function setAuthenticatedCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin ?? ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  // If origin doesn't match, no Access-Control-Allow-Origin is set — browser blocks the request
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

/** Set permissive CORS headers for public endpoints (no cookies) */
export function setPublicCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
