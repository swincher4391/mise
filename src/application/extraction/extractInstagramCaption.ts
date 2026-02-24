/**
 * Extract recipe text from an Instagram reel/post caption.
 * Instagram doesn't include structured recipe data (JSON-LD, microdata).
 * The captioned embed endpoint returns the post caption as HTML text.
 *
 * Embed HTML structure:
 *   <div class="Caption">
 *     <a class="CaptionUsername">username</a>
 *     <br><br>
 *     Caption text with <br> line breaks...
 *     <a>#hashtag</a>
 *     <div class="CaptionComments">...</div>   ← stop here
 *   </div>
 */

/** Convert an Instagram URL to its captioned embed URL */
export function toInstagramEmbedUrl(url: string): string | null {
  // Match /reel/SHORTCODE/, /reels/SHORTCODE/, or /p/SHORTCODE/
  const match = url.match(/instagram\.com\/(?:reels?|p)\/([\w-]+)/)
  if (!match) return null
  return `https://www.instagram.com/reel/${match[1]}/embed/captioned/`
}

/** Check if a URL is an Instagram post/reel */
export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(reels?|p)\//i.test(url)
}

/** Check if a URL is a TikTok video */
export function isTikTokUrl(url: string): boolean {
  return /tiktok\.com\//i.test(url)
}

/** Check if a URL is a YouTube Short */
export function isYouTubeShortsUrl(url: string): boolean {
  return /youtube\.com\/shorts\//i.test(url) || /youtu\.be\//i.test(url)
}

/** Extract caption from og:description meta tag on the main Instagram page */
export function extractCaptionFromMeta(html: string): string | null {
  // og:description contains: "80K likes, 19K comments - username on DATE: "CAPTION TEXT""
  const ogMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"/)
  if (!ogMatch) return null

  let text = ogMatch[1]

  // Decode HTML entities and escaped newlines first (before stripping prefix/quotes)
  text = decodeEntities(text)
    .replace(/\\n/g, '\n')

  // Strip the "80K likes, 19K comments - username on DATE: " prefix
  // Pattern: everything up to the first opening quote after the colon
  text = text.replace(/^[\d.,KMB]+\s*likes?,?\s*[\d.,KMB]+\s*comments?\s*-\s*\w+\s+on\s+[^:]+:\s*"?/, '')
  // Strip trailing quote (og:description wraps caption in quotes, sometimes followed by period)
  text = text.replace(/"\s*\.?\s*$/, '')

  // Clean up hashtags and engagement text
  text = text
    .replace(/#\w+/g, '')
    .replace(/\bcomment\s+\w+\s+and\s+I['']ll\b.*$/gim, '')
    .replace(/\bcomment\s+\w+\b.*send\b.*$/gim, '')
    .replace(/^follow\s+(for|me)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text || null
}

/** Extract caption text from Instagram's captioned embed HTML */
export function extractCaptionFromEmbed(html: string): string | null {
  // Extract the <div class="Caption"> block
  const captionMatch = html.match(/<div[^>]*class="Caption"[^>]*>([\s\S]*?)<div[^>]*class="CaptionComments"/)
  if (!captionMatch) {
    // Fallback: try without CaptionComments boundary
    const fallback = html.match(/<div[^>]*class="Caption"[^>]*>([\s\S]*?)<\/div>/)
    if (!fallback) return null
    return cleanCaption(fallback[1])
  }

  return cleanCaption(captionMatch[1])
}

/** Strip HTML tags, hashtags, and engagement text from caption */
function cleanCaption(html: string): string {
  let text = html
    // Remove the username link at the start
    .replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/gi, '')
    // Remove hashtag links
    .replace(/<a[^>]*>#\w+<\/a>/gi, '')
    // Replace <br> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace block elements with newlines
    .replace(/<\/(p|div|li)>/gi, '\n')
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')

  text = decodeEntities(text)
    // Remove standalone hashtags that weren't in links
    .replace(/^#\w+\s*$/gm, '')
    // Remove "Follow for more" / engagement prompts
    .replace(/^follow\s+(for|me)\b.*$/gim, '')
    // Remove emoji-only lines
    .replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]+$/gmu, '')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

/** Decode all HTML entities (named and numeric) */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
    .replace(/&deg;/g, '°')
}
