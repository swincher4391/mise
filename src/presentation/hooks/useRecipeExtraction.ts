import { useState, useCallback } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { fetchViaProxy } from '@infrastructure/proxy/fetchViaProxy.ts'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

interface UseRecipeExtractionResult {
  recipe: Recipe | null
  isLoading: boolean
  error: string | null
  extract: (url: string) => Promise<void>
}

export function useRecipeExtraction(): UseRecipeExtractionResult {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extract = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setRecipe(null)

    try {
      const html = await fetchViaProxy(url)
      const recipes = extractJsonLd(html)

      if (recipes.length === 0) {
        setError('No recipe found on this page. The site may not include structured recipe data.')
        return
      }

      const normalized = normalizeRecipe(recipes[0], url)
      setRecipe(normalized)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract recipe'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { recipe, isLoading, error, extract }
}
