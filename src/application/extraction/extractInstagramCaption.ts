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
  return html
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
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Remove standalone hashtags that weren't in links
    .replace(/^#\w+\s*$/gm, '')
    // Remove "Follow for more" / engagement prompts
    .replace(/^follow\s+(for|me)\b.*$/gim, '')
    // Remove emoji-only lines
    .replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]+$/gmu, '')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
