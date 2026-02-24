/**
 * Extract post/caption text from social media server-rendered HTML.
 *
 * Both Facebook and Instagram embed full post text in Relay-style JSON blobs
 * inside <script> tags. This module provides a shared extraction strategy:
 *
 * 1. Find all `"text":"..."` JSON values in the HTML
 * 2. Decode JSON escape sequences (\n, \uXXXX, etc.)
 * 3. Return the longest one — this is typically the full post/caption
 *
 * For Instagram, `"caption":{"text":"..."}` is also checked as a more
 * targeted extraction path.
 */

/** Decode JSON string escape sequences */
export function decodeJsonString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\')
}

/**
 * Extract all substantial `"text":"..."` values from embedded JSON in HTML.
 * Returns decoded strings sorted longest-first, deduplicated.
 */
export function extractAllTextValues(html: string, minLength = 100): string[] {
  const matches = [...html.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
  if (matches.length === 0) return []

  const decoded = matches
    .map(([, raw]) => decodeJsonString(raw))
    .filter((t) => t.length >= minLength)

  // Deduplicate and sort longest-first
  return [...new Set(decoded)].sort((a, b) => b.length - a.length)
}

/**
 * Extract Instagram caption text from `"caption":{"text":"..."}` JSON fields.
 * More targeted than extractAllTextValues — only returns actual post captions.
 * Returns decoded strings sorted longest-first, deduplicated.
 */
export function extractCaptionTextValues(html: string): string[] {
  const matches = [...html.matchAll(/"caption"\s*:\s*\{[^}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
  if (matches.length === 0) return []

  const decoded = matches
    .map(([, raw]) => decodeJsonString(raw))
    .filter((t) => t.length >= 50)

  return [...new Set(decoded)].sort((a, b) => b.length - a.length)
}

/**
 * Extract the longest meaningful post text from social media HTML.
 * Tries caption-specific extraction first, then falls back to generic text.
 */
export function extractSocialPostText(html: string): string | null {
  // Try caption-specific path first (Instagram)
  const captions = extractCaptionTextValues(html)
  if (captions.length > 0) return captions[0]

  // Fall back to generic longest-text extraction (Facebook)
  const texts = extractAllTextValues(html)
  return texts[0] ?? null
}
