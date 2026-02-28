import { useState, useCallback } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { fetchViaProxy } from '@infrastructure/proxy/fetchViaProxy.ts'
import { fetchViaBrowser } from '@infrastructure/proxy/fetchViaBrowser.ts'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'
import { extractImageRecipe } from '@infrastructure/ocr/extractImageRecipe.ts'
import { createImageRecipe } from '@application/extraction/createImageRecipe.ts'
import { isInstagramUrl, isTikTokUrl, isYouTubeShortsUrl, extractInstagramShortcode, extractCaptionFromJson, extractCaptionFromMeta, toInstagramEmbedUrl, extractCaptionFromEmbed } from '@application/extraction/extractInstagramCaption.ts'
import { isFacebookUrl, extractFacebookPostText } from '@application/extraction/extractFacebookPost.ts'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
import { transcribeYouTubeVideo } from '@infrastructure/video/transcribeYouTubeVideo.ts'
import { analyzeVideo } from '@infrastructure/video/analyzeVideo.ts'
import { getCachedExtraction, cacheExtraction } from '@infrastructure/db/extractionCacheRepository.ts'

export interface ExtractionStatus {
  message: string
  step: number
  totalSteps: number
}

interface UseRecipeExtractionResult {
  recipe: Recipe | null
  isLoading: boolean
  error: string | null
  ocrText: string | null
  extractionStatus: ExtractionStatus | null
  extract: (url: string) => Promise<void>
  extractFromImage: (imageBase64: string) => Promise<void>
  setRecipe: (recipe: Recipe | null) => void
  clearOcrText: () => void
}

/**
 * Try to parse a recipe from the transcript or OCR text.
 * Returns the recipe if found, null otherwise.
 */
function tryParseVideoResult(
  text: string | null,
  sourceUrl: string
): Recipe | null {
  if (!text) return null
  const parsed = parseTextRecipe(text)
  if (parsed.ingredientLines.length > 0 || parsed.stepLines.length > 0) {
    const recipe = createManualRecipe({ ...parsed, sourceUrl })
    recipe.extractionLayer = 'text'
    return recipe
  }
  return null
}

export function useRecipeExtraction(): UseRecipeExtractionResult {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null)

  const extract = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setRecipe(null)
    setOcrText(null)
    setExtractionStatus(null)

    try {
      // Short-form video platforms — skip HTML fetch entirely and go straight
      // to video analysis since these sites block proxied requests
      // and never have structured recipe data.
      const isShortVideo = isTikTokUrl(url) || isYouTubeShortsUrl(url)
      if (isShortVideo) {
        const platform = isTikTokUrl(url) ? 'TikTok' : 'YouTube Short'
        const isYT = isYouTubeShortsUrl(url)

        if (isYT) {
          // YouTube Shorts: use dedicated transcript endpoint
          setExtractionStatus({ message: 'Extracting captions…', step: 1, totalSteps: 1 })
          try {
            const transcript = await transcribeYouTubeVideo(url)
            const found = tryParseVideoResult(transcript, url)
            if (found) { setRecipe(found); return }
          } catch {
            // Transcription failed
          }
        } else {
          // TikTok: use unified analyze-video (single capture, parallel pipelines)
          setExtractionStatus({ message: 'Analyzing video…', step: 1, totalSteps: 1 })

          // Check cache first
          const cached = await getCachedExtraction(url).catch(() => null)
          if (cached) {
            const found = tryParseVideoResult(cached.transcript, url)
              ?? tryParseVideoResult(cached.ocrText, url)
            if (found) { setRecipe(found); return }
          }

          try {
            const result = await analyzeVideo(url)

            // Cache the result for future use
            cacheExtraction(url, result).catch(() => {})

            // Try transcript first, fall back to OCR
            const found = tryParseVideoResult(result.transcript, url)
              ?? tryParseVideoResult(result.ocrText, url)
            if (found) { setRecipe(found); return }
          } catch {
            // Video analysis failed
          }
        }

        setError(`Couldn't extract a recipe from this ${platform}. Try copying the recipe text from the comments and using Paste to import it, or screenshot it and use Photo import.`)
        return
      }

      // Facebook posts — fetch HTML and extract post text from embedded JSON
      if (isFacebookUrl(url)) {
        setExtractionStatus({ message: 'Fetching Facebook post…', step: 1, totalSteps: 2 })
        const html = await fetchViaProxy(url)

        setExtractionStatus({ message: 'Extracting recipe text…', step: 2, totalSteps: 2 })
        const postText = extractFacebookPostText(html)
        if (postText) {
          const found = tryParseVideoResult(postText, url)
          if (found) { setRecipe(found); return }
        }

        setError("Couldn't extract a recipe from this Facebook post. Try copying the recipe text and using Paste to import it, or screenshot it and use Photo import.")
        return
      }

      // Domains that block all datacenter IPs (both fetch and headless browser).
      const BLOCKED_DOMAINS = [
        'allrecipes.com',
        'foodnetwork.com',
        'food.com',
        'cookinglight.com',
        'eatingwell.com',
        'myrecipes.com',
        'southernliving.com',
        'thekitchn.com',
      ]
      const urlHostname = (() => { try { return new URL(url).hostname.toLowerCase() } catch { return '' } })()
      const isKnownBlocked = BLOCKED_DOMAINS.some(d => urlHostname === d || urlHostname.endsWith('.' + d))

      if (isKnownBlocked) {
        setError(`${urlHostname.replace(/^www\./, '')} blocks automated access. Open the recipe in your browser and use the Paste tab to copy the recipe text, or use the Mise bookmarklet to import directly.`)
        return
      }

      const isInstagram = isInstagramUrl(url)
      const totalSteps = isInstagram ? 4 : 2

      setExtractionStatus({ message: 'Fetching page…', step: 1, totalSteps })
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
        setExtractionStatus({ message: 'Retrying with headless browser…', step: 1, totalSteps })
        try {
          html = await fetchViaBrowser(url)
        } catch {
          setError('This site blocked automated access. Use the Mise Chrome extension to extract directly, or try Photo import.')
          return
        }
      }

      // Layer 1: JSON-LD
      setExtractionStatus({ message: 'Scanning for recipe data…', step: 2, totalSteps })
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
      if (isInstagram) {
        setExtractionStatus({ message: 'Extracting caption…', step: 3, totalSteps })
        const shortcode = extractInstagramShortcode(url)

        // Primary: extract full caption from embedded JSON (untruncated)
        const jsonCaption = extractCaptionFromJson(html, shortcode ?? undefined)
        if (jsonCaption) {
          const found = tryParseVideoResult(jsonCaption, url)
          if (found) { setRecipe(found); return }
        }

        // Fallback: og:description meta tag (truncated but sometimes sufficient)
        const metaCaption = extractCaptionFromMeta(html)
        if (metaCaption) {
          const found = tryParseVideoResult(metaCaption, url)
          if (found) { setRecipe(found); return }
        }

        // Fallback: captioned embed endpoint (increasingly unreliable)
        const embedUrl = toInstagramEmbedUrl(url)
        if (embedUrl) {
          try {
            const embedHtml = await fetchViaProxy(embedUrl)
            const caption = extractCaptionFromEmbed(embedHtml)
            if (caption) {
              const found = tryParseVideoResult(caption, url)
              if (found) { setRecipe(found); return }
            }
          } catch {
            // Embed fetch failed — fall through
          }
        }

        // Layer 4: Unified video analysis (single capture, parallel audio + OCR)
        setExtractionStatus({ message: 'Analyzing video…', step: 4, totalSteps })

        // Check cache first
        const cached = await getCachedExtraction(url).catch(() => null)
        if (cached) {
          const found = tryParseVideoResult(cached.transcript, url)
            ?? tryParseVideoResult(cached.ocrText, url)
          if (found) { setRecipe(found); return }
        }

        try {
          const result = await analyzeVideo(url)

          // Cache the result for future use
          cacheExtraction(url, result).catch(() => {})

          // Try transcript first, fall back to OCR
          const found = tryParseVideoResult(result.transcript, url)
            ?? tryParseVideoResult(result.ocrText, url)
          if (found) { setRecipe(found); return }
        } catch {
          // Video analysis failed
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
      setExtractionStatus(null)
    }
  }, [])

  const extractFromImage = useCallback(async (imageBase64: string) => {
    setIsLoading(true)
    setError(null)
    setRecipe(null)
    setOcrText(null)
    setExtractionStatus({ message: 'Analyzing photo…', step: 1, totalSteps: 1 })

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
      setExtractionStatus({ message: 'Falling back to OCR…', step: 1, totalSteps: 1 })
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
      setExtractionStatus(null)
    }
  }, [])

  const clearOcrText = useCallback(() => setOcrText(null), [])

  return { recipe, isLoading, error, ocrText, extractionStatus, extract, extractFromImage, setRecipe, clearOcrText }
}
