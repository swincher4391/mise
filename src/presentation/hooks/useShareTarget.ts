import { useEffect } from 'react'
import { decompressToRecipe } from '@application/share/compressRecipe.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

/**
 * Handles incoming URLs from the Web Share Target API.
 * When the PWA is shared to from another app, the browser navigates to
 * /?url=...&text=...&title=... — this hook extracts the URL and triggers extraction.
 *
 * Also handles ?import={compressed} for direct share link imports (no extraction round-trip).
 */
export function useShareTarget(
  onUrlReceived: (url: string) => void,
  onRecipeImported?: (recipe: Recipe) => void,
) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Direct import: ?import={compressed_data} — skip extraction entirely
    const importData = params.get('import')
    if (importData && onRecipeImported) {
      decompressToRecipe(importData)
        .then((recipe) => {
          onRecipeImported(recipe)
        })
        .catch((err) => {
          console.error('Failed to decompress share import:', err)
        })
        .finally(() => {
          history.replaceState(null, '', window.location.pathname)
        })
      return
    }

    // Existing share target: ?url=... or ?text=...
    const sharedUrl = params.get('url') || ''
    const sharedText = params.get('text') || ''

    // Some platforms put the URL in the text field instead of url
    const url = extractUrl(sharedUrl) || extractUrl(sharedText)

    if (url) {
      onUrlReceived(url)
      // Clean up query params so a refresh doesn't re-trigger
      history.replaceState(null, '', window.location.pathname)
    }
  }, [onUrlReceived, onRecipeImported])
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
