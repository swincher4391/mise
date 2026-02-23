/**
 * Extract recipe text from an Instagram reel/post caption.
 * Instagram doesn't include structured recipe data (JSON-LD, microdata).
 * The captioned embed endpoint returns the post caption as HTML text.
 */

/** Convert an Instagram URL to its captioned embed URL */
export function toInstagramEmbedUrl(url: string): string | null {
  // Match /reel/SHORTCODE/ or /p/SHORTCODE/
  const match = url.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/)
  if (!match) return null
  return `https://www.instagram.com/reel/${match[1]}/embed/captioned/`
}

/** Check if a URL is an Instagram post/reel */
export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(reel|p)\//i.test(url)
}

/** Extract caption text from Instagram's captioned embed HTML */
export function extractCaptionFromEmbed(html: string): string | null {
  // The caption lives inside a <div class="Caption"> with the text in the
  // child elements. We look for the caption container and extract text.

  // Pattern 1: Caption div with class="CaptionText"
  const captionTextMatch = html.match(/<div[^>]*class="CaptionText"[^>]*>([\s\S]*?)<\/div>/i)
  if (captionTextMatch) {
    return cleanCaption(captionTextMatch[1])
  }

  // Pattern 2: Caption container class
  const captionMatch = html.match(/<div[^>]*class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
  if (captionMatch) {
    return cleanCaption(captionMatch[1])
  }

  // Pattern 3: Look for the caption in a span within the embed
  const spanMatch = html.match(/<span[^>]*class="CaptionText"[^>]*>([\s\S]*?)<\/span>/i)
  if (spanMatch) {
    return cleanCaption(spanMatch[1])
  }

  // Pattern 4: data attribute with caption content
  const dataMatch = html.match(/data-caption="([^"]*)"/)
  if (dataMatch) {
    return decodeHtmlEntities(dataMatch[1])
  }

  return null
}

/** Strip HTML tags and clean up caption text */
function cleanCaption(html: string): string {
  return html
    // Replace <br> and <br/> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace block elements with newlines
    .replace(/<\/(p|div|li)>/gi, '\n')
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\n/g, '\n')
    .trim()
}
