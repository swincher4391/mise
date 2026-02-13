import type { Recipe } from '@domain/models/Recipe.ts'
import type { Step } from '@domain/models/Step.ts'
import type { Nutrition } from '@domain/models/Nutrition.ts'
import { parseIngredients } from '@application/parser/IngredientParser.ts'
import { parseIsoDuration } from './parseIsoDuration.ts'
import { extractPrimaryTimer } from '@application/parser/parseStepTimers.ts'
import { autoTagRecipe } from './autoTag.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Decode HTML entities that survive JSON-LD extraction.
 * Uses a detached textarea element as the browser's built-in decoder —
 * textarea.innerHTML parses entities, textarea.value returns plain text.
 * This is safe: the element is never attached to the DOM.
 */
const _textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null

function decodeEntities(text: string): string {
  if (!_textarea) return text
  _textarea.innerHTML = text
  return _textarea.value
}

const PARSER_VERSION = '1.0.0'
const SCHEMA_VERSION = 1

function generateId(): string {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Parse recipeYield to a number. Handles: "6 servings", "6", ["6"], ["6 servings"]. */
function parseServings(raw: any): { servings: number | null; servingsText: string | null } {
  if (raw == null) return { servings: null, servingsText: null }

  let text: string
  if (Array.isArray(raw)) {
    text = String(raw[0] ?? '')
  } else {
    text = String(raw)
  }

  const servingsText = text || null
  const match = text.match(/(\d+)/)
  const servings = match ? parseInt(match[1], 10) : null

  return { servings, servingsText }
}

/** Normalize image to a single URL string. Handles: string, array, ImageObject, contentUrl. */
function normalizeImage(raw: any): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const first = raw[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object') return first.url || first.contentUrl || null
    return null
  }
  if (typeof raw === 'object') return raw.url || raw.contentUrl || null
  return null
}

/** Extract og:image URL from HTML as a fallback when JSON-LD image is missing. */
function extractOgImage(html: string): string | null {
  const match = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*>/i)
  return match?.[1] || null
}

/**
 * Normalize recipeInstructions to Step[].
 * Handles: string[], HowToStep[], HowToSection[], single string.
 */
function normalizeSteps(raw: any): Step[] {
  if (!raw) return []

  const steps: Step[] = []
  let order = 1

  function addStep(text: string) {
    const trimmed = decodeEntities(text.trim())
    if (!trimmed) return
    steps.push({
      id: `step_${order}`,
      order,
      text: trimmed,
      timerSeconds: extractPrimaryTimer(trimmed),
      ingredientRefs: [],
    })
    order++
  }

  // Single string
  if (typeof raw === 'string') {
    // Split on newlines or numbered lines
    const lines = raw.split(/\n+/).filter((l: string) => l.trim())
    for (const line of lines) {
      addStep(line.replace(/^\d+\.\s*/, ''))
    }
    return steps
  }

  if (!Array.isArray(raw)) return steps

  for (const item of raw) {
    if (typeof item === 'string') {
      addStep(item)
    } else if (item && typeof item === 'object') {
      const type = item['@type'] || ''

      if (type === 'HowToSection' || type.endsWith('/HowToSection')) {
        // HowToSection contains itemListElement with HowToSteps
        const sectionItems = item.itemListElement || []
        if (item.name) {
          addStep(`[${item.name}]`)
        }
        for (const subItem of sectionItems) {
          if (typeof subItem === 'string') {
            addStep(subItem)
          } else if (subItem?.text) {
            addStep(subItem.text)
          }
        }
      } else if (type === 'HowToStep' || type.endsWith('/HowToStep') || item.text) {
        addStep(item.text || '')
      }
    }
  }

  return steps
}

/** Extract nutrition if available. */
function normalizeNutrition(raw: any): Nutrition | null {
  if (!raw) return null

  function parseNum(val: any): number | null {
    if (val == null) return null
    const num = parseFloat(String(val))
    return isNaN(num) ? null : num
  }

  return {
    calories: parseNum(raw.calories),
    fatG: parseNum(raw.fatContent),
    saturatedFatG: parseNum(raw.saturatedFatContent),
    carbohydrateG: parseNum(raw.carbohydrateContent),
    fiberG: parseNum(raw.fiberContent),
    sugarG: parseNum(raw.sugarContent),
    proteinG: parseNum(raw.proteinContent),
    cholesterolMg: parseNum(raw.cholesterolContent),
    sodiumMg: parseNum(raw.sodiumContent),
  }
}

/** Normalize a string or array of strings to a string array. */
function toStringArray(raw: any): string[] {
  if (!raw) return []
  if (typeof raw === 'string') return raw.split(',').map((s: string) => decodeEntities(s.trim())).filter(Boolean)
  if (Array.isArray(raw)) return raw.map((s: any) => decodeEntities(String(s))).filter(Boolean)
  return []
}

/**
 * Map a raw JSON-LD Recipe object to the domain Recipe interface.
 */
export function normalizeRecipe(jsonLd: any, sourceUrl: string, html?: string): Recipe {
  const { servings, servingsText } = parseServings(jsonLd.recipeYield)

  const rawIngredients: string[] = Array.isArray(jsonLd.recipeIngredient)
    ? jsonLd.recipeIngredient.map((s: any) => decodeEntities(String(s)))
    : []

  return {
    id: generateId(),
    title: decodeEntities(String(jsonLd.name || 'Untitled Recipe')),
    sourceUrl,
    sourceDomain: extractDomain(sourceUrl),
    author: (() => {
      const raw = jsonLd.author?.name || (typeof jsonLd.author === 'string' ? jsonLd.author : null)
      return raw ? decodeEntities(String(raw)) : null
    })(),
    description: jsonLd.description ? decodeEntities(String(jsonLd.description)) : null,
    imageUrl: normalizeImage(jsonLd.image) || (html ? extractOgImage(html) : null),
    servings,
    servingsText,
    prepTimeMinutes: parseIsoDuration(jsonLd.prepTime),
    cookTimeMinutes: parseIsoDuration(jsonLd.cookTime),
    totalTimeMinutes: parseIsoDuration(jsonLd.totalTime),
    ingredients: parseIngredients(rawIngredients),
    steps: normalizeSteps(jsonLd.recipeInstructions),
    nutrition: normalizeNutrition(jsonLd.nutrition),
    keywords: toStringArray(jsonLd.keywords),
    cuisines: toStringArray(jsonLd.recipeCuisine),
    categories: toStringArray(jsonLd.recipeCategory),
    tags: autoTagRecipe(
      toStringArray(jsonLd.recipeCategory),
      toStringArray(jsonLd.keywords),
      String(jsonLd.name || ''),
    ),
    notes: null,
    favorite: false,
    extractedAt: new Date().toISOString(),
    extractionLayer: 'json-ld',
    parserVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
  }
}
