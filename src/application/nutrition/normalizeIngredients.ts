import type { Ingredient } from '@domain/models/Ingredient.ts'
import type { NormalizedIngredient } from '@domain/models/RecipeNutrition.ts'

/**
 * Call the LLM normalization endpoint to get clean USDA-friendly names
 * for a list of parsed ingredients. Returns a map from raw ingredient
 * string to NormalizedIngredient, or null on failure (graceful fallback).
 */
export async function normalizeIngredients(
  ingredients: Ingredient[],
): Promise<NormalizedIngredient[] | null> {
  if (ingredients.length === 0) return null

  const rawStrings = ingredients.map((i) => i.raw)

  try {
    const response = await fetch('/api/recipe-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'normalize', ingredients: rawStrings }),
    })

    if (!response.ok) {
      console.warn('[Mise:Normalize] API returned', response.status)
      return null
    }

    const data = await response.json()
    console.log('[Mise:Normalize] raw response:', data)

    if (!data.normalized || !Array.isArray(data.normalized)) {
      console.warn('[Mise:Normalize] no normalized array in response:', Object.keys(data))
      return null
    }

    // Validate each entry has required fields
    const result: NormalizedIngredient[] = data.normalized
      .filter(
        (entry: any) =>
          typeof entry.raw === 'string' &&
          typeof entry.name === 'string' &&
          ['MATCH', 'SKIP', 'ESTIMATE_QUANTITY'].includes(entry.action),
      )
      .map((entry: any) => ({
        raw: entry.raw,
        name: entry.name,
        action: entry.action as NormalizedIngredient['action'],
        ...(entry.defaultGrams != null ? { defaultGrams: Number(entry.defaultGrams) } : {}),
      }))

    console.log('[Mise:Normalize] validated entries:', result.length, '/', data.normalized.length)
    return result.length > 0 ? result : null
  } catch (err) {
    console.error('[Mise:Normalize] fetch error:', err)
    // Graceful fallback: return null so callers use raw names
    return null
  }
}

/**
 * Build a lookup map from raw ingredient string → normalized name.
 * Falls back to the parsed ingredient name if normalization is unavailable.
 */
/**
 * Build a lookup map from raw ingredient string → normalized entry.
 * Uses index-based mapping (ingredients[i] → normalized[i]) rather than
 * raw string matching, since the LLM may not echo back exact raw strings.
 */
export function buildNormalizedNameMap(
  ingredients: Ingredient[],
  normalized: NormalizedIngredient[] | null,
): Record<string, NormalizedIngredient> {
  const map: Record<string, NormalizedIngredient> = {}
  if (!normalized) return map

  // Primary: index-based mapping (most reliable)
  for (let i = 0; i < ingredients.length && i < normalized.length; i++) {
    map[ingredients[i].raw] = normalized[i]
  }

  // Fallback: also map by raw string for any extras
  for (const entry of normalized) {
    if (!map[entry.raw]) {
      map[entry.raw] = entry
    }
  }

  return map
}
