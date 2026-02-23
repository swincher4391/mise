import { useState, useCallback } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { fetchViaProxy } from '@infrastructure/proxy/fetchViaProxy.ts'
import { fetchViaBrowser } from '@infrastructure/proxy/fetchViaBrowser.ts'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'
import { extractImageRecipe } from '@infrastructure/ocr/extractImageRecipe.ts'
import { createImageRecipe } from '@application/extraction/createImageRecipe.ts'
import { isInstagramUrl, toInstagramEmbedUrl, extractCaptionFromEmbed, extractCaptionFromMeta } from '@application/extraction/extractInstagramCaption.ts'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
import { transcribeInstagramVideo } from '@infrastructure/video/transcribeInstagramVideo.ts'

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
      let html = await fetchViaProxy(url)

      // Detect bot protection / block pages
      const isBlocked =
        html.includes('Access to this page has been denied') ||
        html.includes('Please verify you are a human') ||
        html.includes('Enable JavaScript and cookies to continue') ||
        html.includes('Checking if the site connection is secure') ||
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('Just a moment...') ||
        html.includes('cf-browser-verification') ||
        html.includes('_cf_chl_opt') ||
        html.length < 1500

      if (isBlocked) {
        // Auto-retry with headless browser fallback
        try {
          html = await fetchViaBrowser(url)
        } catch {
          setError('This site blocked automated access. Use the Mise Chrome extension to extract directly, or try Photo import.')
          return
        }
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

      // Layer 3: Instagram caption extraction
      if (isInstagramUrl(url)) {
        // Try og:description from the main page first (works even when embedding is disabled)
        const metaCaption = extractCaptionFromMeta(html)
        if (metaCaption) {
          const parsed = parseTextRecipe(metaCaption)
          if (parsed.ingredientLines.length > 0 || parsed.stepLines.length > 0) {
            const recipe = createManualRecipe({ ...parsed, sourceUrl: url })
            recipe.extractionLayer = 'text'
            setRecipe(recipe)
            return
          }
        }

        // Fall back to captioned embed endpoint
        const embedUrl = toInstagramEmbedUrl(url)
        if (embedUrl) {
          try {
            const embedHtml = await fetchViaProxy(embedUrl)
            const caption = extractCaptionFromEmbed(embedHtml)
            if (caption) {
              const parsed = parseTextRecipe(caption)
              if (parsed.ingredientLines.length > 0 || parsed.stepLines.length > 0) {
                const recipe = createManualRecipe({ ...parsed, sourceUrl: url })
                recipe.extractionLayer = 'text'
                setRecipe(recipe)
                return
              }
            }
          } catch {
            // Embed fetch failed — fall through to error
          }
        }
        // Layer 4: Video transcription (recipe spoken in reel audio)
        try {
          const transcript = await transcribeInstagramVideo(url)
          if (transcript) {
            const parsed = parseTextRecipe(transcript)
            if (parsed.ingredientLines.length > 0 || parsed.stepLines.length > 0) {
              const recipe = createManualRecipe({ ...parsed, sourceUrl: url })
              recipe.extractionLayer = 'text'
              setRecipe(recipe)
              return
            }
          }
        } catch {
          // Transcription failed — fall through to error message
        }

        setError("Couldn't extract a recipe from this Instagram post. The recipe may be in the comments — try copying the recipe text from the caption or comments and using Paste to import it, or screenshot it and use Photo import.")
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
