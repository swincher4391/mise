import { useState, useCallback } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { fetchViaProxy } from '@infrastructure/proxy/fetchViaProxy.ts'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'
import { extractImageRecipe } from '@infrastructure/ocr/extractImageRecipe.ts'
import { createImageRecipe } from '@application/extraction/createImageRecipe.ts'

interface UseRecipeExtractionResult {
  recipe: Recipe | null
  isLoading: boolean
  error: string | null
  ocrText: string | null
  extract: (url: string) => Promise<void>
  extractFromImage: (imageBase64: string) => Promise<void>
  setRecipe: (recipe: Recipe | null) => void
  clearOcrText: () => void
}

export function useRecipeExtraction(): UseRecipeExtractionResult {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrText, setOcrText] = useState<string | null>(null)

  const extract = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setRecipe(null)
    setOcrText(null)

    try {
      const html = await fetchViaProxy(url)

      // Detect bot protection block pages
      if (html.includes('Access to this page has been denied') || html.includes('Please verify you are a human')) {
        setError('This site blocked automated access. Try taking a screenshot and using Photo import instead.')
        return
      }

      // Layer 1: JSON-LD
      const recipes = extractJsonLd(html)
      if (recipes.length > 0) {
        const normalized = normalizeRecipe(recipes[0], url, html)
        setRecipe(normalized)
        return
      }

      // Layer 2: Microdata/RDFa
      const microdataRecipes = extractMicrodata(html)
      if (microdataRecipes.length > 0) {
        const normalized = normalizeRecipe(microdataRecipes[0], url, html)
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

  const extractFromImage = useCallback(async (imageBase64: string) => {
    setIsLoading(true)
    setError(null)
    setRecipe(null)
    setOcrText(null)

    try {
      // Try HF Vision API via serverless function
      const result = await extractImageRecipe(imageBase64)
      const recipe = createImageRecipe({
        title: result.title,
        ingredientLines: result.ingredients,
        stepLines: result.steps,
        servings: result.servings,
        prepTime: result.prepTime,
        cookTime: result.cookTime,
      })
      setRecipe(recipe)
    } catch (apiError) {
      // Log the API error for debugging, then fall back to Tesseract.js OCR
      console.warn('[Mise] Vision API failed, falling back to OCR:', apiError instanceof Error ? apiError.message : apiError)
      try {
        const { extractTextFromImage } = await import('@infrastructure/ocr/tesseractOcr.ts')
        const text = await extractTextFromImage(imageBase64)
        if (text.trim()) {
          setOcrText(text)
        } else {
          setError('Could not read any text from this image. Try a clearer photo.')
        }
      } catch {
        // Both methods failed — show the original API error
        const message = apiError instanceof Error ? apiError.message : 'Failed to extract recipe from image'
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearOcrText = useCallback(() => setOcrText(null), [])

  return { recipe, isLoading, error, ocrText, extract, extractFromImage, setRecipe, clearOcrText }
}
