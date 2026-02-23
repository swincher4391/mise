import { useEffect } from 'react'

/**
 * Handles incoming URLs from the Web Share Target API.
 * When the PWA is shared to from another app, the browser navigates to
 * /?url=...&text=...&title=... — this hook extracts the URL and triggers extraction.
 */
export function useShareTarget(onUrlReceived: (url: string) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get('url') || ''
    const sharedText = params.get('text') || ''

    // Some platforms put the URL in the text field instead of url
    const url = extractUrl(sharedUrl) || extractUrl(sharedText)

    if (url) {
      onUrlReceived(url)
      // Clean up query params so a refresh doesn't re-trigger
      history.replaceState(null, '', window.location.pathname)
    }
  }, [onUrlReceived])
}

/** Extract first URL from a string (handles text that contains a URL among other text) */
function extractUrl(text: string): string | null {
  if (!text) return null
  const trimmed = text.trim()

  // If the whole string is a URL, use it directly
  if (/^https?:\/\//i.test(trimmed)) return trimmed

  // Otherwise try to find a URL embedded in the text
  const match = trimmed.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}
