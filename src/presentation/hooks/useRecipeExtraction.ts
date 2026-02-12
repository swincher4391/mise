import { useState, useCallback } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { fetchViaProxy } from '@infrastructure/proxy/fetchViaProxy.ts'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

interface UseRecipeExtractionResult {
  recipe: Recipe | null
  isLoading: boolean
  error: string | null
  extract: (url: string) => Promise<void>
  setRecipe: (recipe: Recipe | null) => void
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

      // Layer 1: JSON-LD
      const recipes = extractJsonLd(html)
      if (recipes.length > 0) {
        const normalized = normalizeRecipe(recipes[0], url)
        setRecipe(normalized)
        return
      }

      // Layer 2: Microdata/RDFa
      const microdataRecipes = extractMicrodata(html)
      if (microdataRecipes.length > 0) {
        const normalized = normalizeRecipe(microdataRecipes[0], url)
        normalized.extractionLayer = 'microdata'
        setRecipe(normalized)
        return
      }

      setError('No recipe found on this page. The site may not include structured recipe data.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract recipe'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { recipe, isLoading, error, extract, setRecipe }
}
