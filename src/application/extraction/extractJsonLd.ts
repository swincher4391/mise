/**
 * Extract JSON-LD Recipe data from an HTML string.
 *
 * Handles:
 * - Multiple <script type="application/ld+json"> blocks
 * - @graph arrays containing Recipe
 * - Array @type (e.g. ["Recipe", "HowTo"])
 * - Nested structures
 * - Multiple Recipe blocks (returns all found)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function isRecipeType(type: any): boolean {
  if (typeof type === 'string') {
    return type === 'Recipe' || type.endsWith('/Recipe')
  }
  if (Array.isArray(type)) {
    return type.some((t) => typeof t === 'string' && (t === 'Recipe' || t.endsWith('/Recipe')))
  }
  return false
}

function findRecipesInObject(obj: any): any[] {
  const recipes: any[] = []

  if (!obj || typeof obj !== 'object') return recipes

  // Check if this object itself is a Recipe
  if (isRecipeType(obj['@type'])) {
    recipes.push(obj)
    return recipes
  }

  // Check @graph array
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      recipes.push(...findRecipesInObject(item))
    }
    return recipes
  }

  // If it's an array, search each element
  if (Array.isArray(obj)) {
    for (const item of obj) {
      recipes.push(...findRecipesInObject(item))
    }
  }

  return recipes
}

/**
 * Extract all Recipe JSON-LD objects from an HTML string.
 * Returns an array of raw JSON-LD recipe objects.
 */
export function extractJsonLd(html: string): any[] {
  const recipes: any[] = []

  // Find all <script type="application/ld+json"> blocks
  const scriptPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1].trim()
    if (!content) continue

    try {
      const parsed = JSON.parse(content)
      recipes.push(...findRecipesInObject(parsed))
    } catch {
      // Invalid JSON, skip this block
    }
  }

  return recipes
}
