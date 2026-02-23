import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { buildShareUrl } from './compressRecipe.ts'

/**
 * Share a recipe via a Mise URL containing compressed recipe data.
 * Uses Web Share API on mobile, clipboard fallback on desktop.
 * Returns 'shared' | 'copied' | false.
 */
export async function shareRecipe(
  recipe: Recipe | SavedRecipe,
): Promise<'shared' | 'copied' | false> {
  const url = await buildShareUrl(recipe)

  // Try Web Share API first (mobile-friendly)
  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.title, url })
      return 'shared'
    } catch (err) {
      // User cancelled or share failed — fall through to clipboard
      if ((err as DOMException)?.name === 'AbortError') return false
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return false
  }
}
