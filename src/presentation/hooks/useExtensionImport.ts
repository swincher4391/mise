import { useEffect } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

/**
 * Listens for recipes sent from the Chrome extension via BroadcastChannel
 * or hash fragment. When a recipe arrives, calls onRecipeReceived.
 */
export function useExtensionImport(onRecipeReceived: (recipe: Recipe) => void) {
  useEffect(() => {
    // BroadcastChannel listener
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('mise-recipe-import')
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'IMPORT_RECIPE' && event.data.recipe) {
          const raw = event.data.recipe
          const recipe = normalizeExtensionRecipe(raw)
          onRecipeReceived(recipe)
        }
      }
    } catch {
      // BroadcastChannel not available
    }

    // Hash fragment check (on mount)
    const hash = window.location.hash
    if (hash.startsWith('#import=')) {
      try {
        const payload = hash.slice(8)
        // Size limit: reject payloads over 1MB decoded
        if (payload.length > 1_400_000) throw new Error('Payload too large')
        const decoded = atob(payload)
        if (decoded.length > 1_000_000) throw new Error('Payload too large')
        const raw = JSON.parse(decoded)
        // Basic schema validation
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Invalid recipe format')
        if (!raw.title && !raw.name && !raw['@type']) throw new Error('Missing recipe fields')
        const recipe = normalizeExtensionRecipe(raw)
        onRecipeReceived(recipe)
        // Clean up the hash
        history.replaceState(null, '', window.location.pathname + window.location.search)
      } catch {
        // Invalid payload, ignore
      }
    }

    return () => {
      channel?.close()
    }
  }, [onRecipeReceived])
}

/**
 * Convert the lightweight extension recipe format into a full Recipe.
 * The extension sends a simplified object with rawIngredients/rawSteps
 * rather than parsed Ingredient[]/Step[] objects.
 */
function normalizeExtensionRecipe(raw: any): Recipe {
  // If the extension already sent a full raw JSON-LD-like object, normalize it
  if (raw.recipeIngredient || raw['@type']) {
    return normalizeRecipe(raw, raw.sourceUrl || '')
  }

  // Otherwise it's the lightweight extension format — reconstruct a JSON-LD-like
  // object so normalizeRecipe can handle it
  const jsonLdLike: any = {
    '@type': 'Recipe',
    name: raw.title,
    description: raw.description,
    image: raw.imageUrl,
    author: raw.author ? { name: raw.author } : undefined,
    recipeYield: raw.servingsText,
    recipeIngredient: raw.rawIngredients || [],
    recipeInstructions: (raw.rawSteps || []).map((s: any) => ({
      '@type': 'HowToStep',
      text: typeof s === 'string' ? s : s.text,
    })),
    keywords: raw.keywords,
    recipeCuisine: raw.cuisines,
    recipeCategory: raw.categories,
  }

  const recipe = normalizeRecipe(jsonLdLike, raw.sourceUrl || '')
  recipe.extractionLayer = raw.extractionLayer || 'json-ld'
  return recipe
}
