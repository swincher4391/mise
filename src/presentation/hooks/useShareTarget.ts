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
    console.log('[Mise:ShareTarget] effect fired, search:', window.location.search.slice(0, 80))

    // Direct import: ?import={compressed_data} — skip extraction entirely
    // NOTE: We do NOT clean the URL here. ExtractPage cleans it after consuming
    // the recipe. This prevents a race condition where the SW auto-update reloads
    // the page before the recipe is consumed, losing the import data.
    const importData = params.get('import')
    if (importData && onRecipeImported) {
      console.log('[Mise:ShareTarget] found import data, decompressing...')
      decompressToRecipe(importData)
        .then((recipe) => {
          console.log('[Mise:ShareTarget] decompressed, calling onRecipeImported:', recipe.title)
          onRecipeImported(recipe)
        })
        .catch((err) => {
          console.error('[Mise:ShareTarget] decompress failed:', err)
        })
      return
    }

    // Existing share target: ?url=... or ?text=...
    const sharedUrl = params.get('url') || ''
    const sharedText = params.get('text') || ''

    // Some platforms put the URL in the text field instead of url
    const url = extractUrl(sharedUrl) || extractUrl(sharedText)

    if (url) {
      console.log('[Mise:ShareTarget] found shared URL:', url)
      onUrlReceived(url)
      // Clean up query params so a refresh doesn't re-trigger
      history.replaceState(null, '', window.location.pathname)
    } else {
      console.log('[Mise:ShareTarget] no import or URL params found')
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
