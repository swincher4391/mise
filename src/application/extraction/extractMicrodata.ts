/**
 * Extract Schema.org Recipe data from HTML using Microdata (itemprop/itemscope).
 *
 * This is Layer 2 of the extraction pipeline — used when no JSON-LD is found.
 * Returns an array of JSON-LD-compatible objects so normalizeRecipe() can handle them.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Extract all Recipe microdata objects from an HTML string.
 * Returns an array of raw JSON-LD-like recipe objects.
 */
export function extractMicrodata(html: string): any[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const recipeElements = doc.querySelectorAll('[itemtype*="schema.org/Recipe"]')
  if (recipeElements.length === 0) return []

  const recipes: any[] = []

  for (const el of recipeElements) {
    const recipe = extractItemScope(el)
    recipe['@type'] = 'Recipe'
    recipes.push(recipe)
  }

  return recipes
}

/**
 * Walk an itemscope element, collecting itemprop values into an object.
 */
function extractItemScope(root: Element): any {
  const result: any = {}
  const processed = new Set<Element>()

  function walkChildren(parent: Element) {
    for (const child of parent.children) {
      if (processed.has(child)) continue

      const prop = child.getAttribute('itemprop')
      const isScope = child.hasAttribute('itemscope')

      if (prop) {
        processed.add(child)

        if (isScope) {
          // Nested itemscope — recurse
          const nested = extractItemScope(child)
          const nestedType = child.getAttribute('itemtype')
          if (nestedType) {
            const typeName = nestedType.split('/').pop() || ''
            nested['@type'] = typeName
          }
          addValue(result, prop, nested)
        } else {
          const value = getPropertyValue(child)
          addValue(result, prop, value)
        }
      } else if (!isScope) {
        // Not an itemprop, not a nested scope — keep walking
        walkChildren(child)
      }
    }
  }

  walkChildren(root)
  return result
}

/**
 * Get the value of an itemprop element based on its tag.
 */
function getPropertyValue(el: Element): string {
  const tag = el.tagName.toLowerCase()

  if (tag === 'meta') {
    return el.getAttribute('content') || ''
  }
  if (tag === 'img') {
    return el.getAttribute('src') || el.getAttribute('content') || ''
  }
  if (tag === 'a' || tag === 'link') {
    return el.getAttribute('href') || ''
  }
  if (tag === 'time') {
    return el.getAttribute('datetime') || el.textContent?.trim() || ''
  }
  if (tag === 'data') {
    return el.getAttribute('value') || el.textContent?.trim() || ''
  }

  return el.textContent?.trim() || ''
}

/**
 * Add a value to the result object. If the key already exists, convert to array.
 * Some properties are always arrays (recipeIngredient, recipeInstructions).
 */
const ARRAY_PROPS = new Set([
  'recipeIngredient',
  'ingredients',
  'recipeInstructions',
  'step',
])

function addValue(obj: any, key: string, value: any): void {
  if (ARRAY_PROPS.has(key)) {
    if (!Array.isArray(obj[key])) {
      obj[key] = obj[key] != null ? [obj[key]] : []
    }
    obj[key].push(value)
  } else if (key in obj) {
    // Already set — convert to array
    if (!Array.isArray(obj[key])) {
      obj[key] = [obj[key]]
    }
    obj[key].push(value)
  } else {
    obj[key] = value
  }
}
