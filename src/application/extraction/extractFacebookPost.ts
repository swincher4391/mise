/**
 * Extract recipe text from a Facebook post.
 *
 * Facebook's server-rendered HTML includes the full post body in Relay-style
 * JSON blobs inside <script> tags. A plain fetch with a browser User-Agent
 * returns this HTML — no headless browser needed.
 */

import { extractAllTextValues } from './extractSocialPostText.ts'

/** Check if a URL is a Facebook post or video */
export function isFacebookUrl(url: string): boolean {
  return /facebook\.com\/(share\/(p|v)\/|.+\/posts\/|.+\/videos\/|permalink\.php)/i.test(url)
}

/**
 * Extract the post text from Facebook's server-rendered HTML.
 * Returns the longest text value found, or null if nothing substantial.
 */
export function extractFacebookPostText(html: string): string | null {
  const texts = extractAllTextValues(html)
  return texts[0] ?? null
}
