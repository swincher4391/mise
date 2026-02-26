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
 * Extract the caption for a specific Instagram post by its shortcode.
 * Instagram's JSON blobs include `"shortcode":"ABC123"` or `"code":"ABC123"`
 * near the post's caption data. We search for <script> blocks containing
 * the shortcode and extract captions only from those blocks.
 * Falls back to the longest caption if shortcode matching fails.
 */
export function extractCaptionByShortcode(html: string, shortcode: string): string | null {
  if (!shortcode) return null

  // Find all <script> blocks in the HTML
  const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]

  for (const [, scriptContent] of scriptBlocks) {
    // Check if this block contains the target shortcode
    const hasShortcode =
      scriptContent.includes(`"shortcode":"${shortcode}"`) ||
      scriptContent.includes(`"code":"${shortcode}"`)
    if (!hasShortcode) continue

    // Extract captions from this specific block
    const captions = extractCaptionTextValues(scriptContent)
    if (captions.length > 0) return captions[0]
  }

  // Shortcode not found in script blocks — try searching the entire HTML
  // in case the JSON spans non-script areas (inline JSON, data attributes, etc.)
  const shortcodePattern = new RegExp(
    `"(?:shortcode|code)"\\s*:\\s*"${escapeRegExp(shortcode)}"`,
  )
  const shortcodeMatch = shortcodePattern.exec(html)
  if (shortcodeMatch) {
    // Extract a window around the shortcode match and look for captions
    const start = Math.max(0, shortcodeMatch.index - 5000)
    const end = Math.min(html.length, shortcodeMatch.index + 5000)
    const window = html.slice(start, end)
    const captions = extractCaptionTextValues(window)
    if (captions.length > 0) return captions[0]
  }

  return null
}

/** Escape special regex characters in a string */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract the longest meaningful post text from social media HTML.
 * Tries caption-specific extraction first, then falls back to generic text.
 */
export function extractSocialPostText(html: string, shortcode?: string): string | null {
  // If we have a shortcode, try targeted extraction first
  if (shortcode) {
    const targeted = extractCaptionByShortcode(html, shortcode)
    if (targeted) return targeted
    // Shortcode was provided but not found in the HTML — return null so the
    // caller can try other extraction methods (e.g. og:description meta tag)
    // rather than returning an unrelated post's caption.
    return null
  }

  // Try caption-specific path (Instagram) — longest caption
  const captions = extractCaptionTextValues(html)
  if (captions.length > 0) return captions[0]

  // Fall back to generic longest-text extraction (Facebook)
  const texts = extractAllTextValues(html)
  return texts[0] ?? null
}
