import { gunzipSync } from 'node:zlib'

/** Max size of the base64url `d` parameter, before inflation. */
export const MAX_ENCODED_BYTES = 12_000

/**
 * Cap the inflated payload. Without this, 12KB of crafted gzip expands to tens
 * of megabytes before JSON.parse doubles it — a cheap memory/CPU DoS. A real
 * recipe is a few KB, so 256KB is generous.
 */
export const MAX_DECODED_BYTES = 256 * 1024

export interface SharePayload {
  /** title */
  t: string
  /** ingredients */
  ig: unknown[]
  /** steps */
  st: unknown[]
  [key: string]: unknown
}

/**
 * Decodes the base64url + gzip share payload used by /api/r and the sitemap.
 * Throws on anything that isn't a well-formed recipe so callers never store or
 * render attacker-shaped data.
 */
export function decodeSharePayload(encoded: string): SharePayload {
  if (Buffer.byteLength(encoded, 'utf8') > MAX_ENCODED_BYTES) {
    throw new Error('Payload too large')
  }

  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const compressed = Buffer.from(base64, 'base64')
  const json = gunzipSync(compressed, { maxOutputLength: MAX_DECODED_BYTES }).toString('utf8')
  const payload = JSON.parse(json)

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload')
  }
  if (!payload.t || typeof payload.t !== 'string') {
    throw new Error('Invalid payload: title required')
  }
  if (!Array.isArray(payload.ig)) {
    throw new Error('Invalid payload: ingredients required')
  }
  if (!Array.isArray(payload.st)) {
    payload.st = []
  }

  return payload as SharePayload
}
