/* eslint-disable no-undef */

/**
 * StorySkip Extension Content Script
 *
 * Runs on every page. Waits for EXTRACT_RECIPE message from popup,
 * then extracts recipe data using inlined JSON-LD and Microdata extractors.
 */

// --- Inlined extractJsonLd ---

function isRecipeType(type) {
  if (typeof type === 'string') {
    return type === 'Recipe' || type.endsWith('/Recipe')
  }
  if (Array.isArray(type)) {
    return type.some((t) => typeof t === 'string' && (t === 'Recipe' || t.endsWith('/Recipe')))
  }
  return false
}

function findRecipesInObject(obj) {
  const recipes = []
  if (!obj || typeof obj !== 'object') return recipes

  if (isRecipeType(obj['@type'])) {
    recipes.push(obj)
    return recipes
  }

  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      recipes.push(...findRecipesInObject(item))
    }
    return recipes
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      recipes.push(...findRecipesInObject(item))
    }
  }

  return recipes
}

function extractJsonLd(html) {
  const recipes = []
  const scriptPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1].trim()
    if (!content) continue

    try {
      const parsed = JSON.parse(content)
      recipes.push(...findRecipesInObject(parsed))
    } catch {
      // Invalid JSON, skip
    }
  }

  return recipes
}

// --- Inlined extractMicrodata ---

const ARRAY_PROPS = new Set([
  'recipeIngredient',
  'ingredients',
  'recipeInstructions',
  'step',
])

function getPropertyValue(el) {
  const tag = el.tagName.toLowerCase()
  if (tag === 'meta') return el.getAttribute('content') || ''
  if (tag === 'img') return el.getAttribute('src') || el.getAttribute('content') || ''
  if (tag === 'a' || tag === 'link') return el.getAttribute('href') || ''
  if (tag === 'time') return el.getAttribute('datetime') || el.textContent?.trim() || ''
  if (tag === 'data') return el.getAttribute('value') || el.textContent?.trim() || ''
  return el.textContent?.trim() || ''
}

function addValue(obj, key, value) {
  if (ARRAY_PROPS.has(key)) {
    if (!Array.isArray(obj[key])) {
      obj[key] = obj[key] != null ? [obj[key]] : []
    }
    obj[key].push(value)
  } else if (key in obj) {
    if (!Array.isArray(obj[key])) {
      obj[key] = [obj[key]]
    }
    obj[key].push(value)
  } else {
    obj[key] = value
  }
}

function extractItemScope(root) {
  const result = {}
  const processed = new Set()

  function walkChildren(parent) {
    for (const child of parent.children) {
      if (processed.has(child)) continue

      const prop = child.getAttribute('itemprop')
      const isScope = child.hasAttribute('itemscope')

      if (prop) {
        processed.add(child)
        if (isScope) {
          const nested = extractItemScope(child)
          const nestedType = child.getAttribute('itemtype')
          if (nestedType) {
            nested['@type'] = nestedType.split('/').pop() || ''
          }
          addValue(result, prop, nested)
        } else {
          addValue(result, prop, getPropertyValue(child))
        }
      } else if (!isScope) {
        walkChildren(child)
      }
    }
  }

  walkChildren(root)
  return result
}

function extractMicrodata(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const recipeElements = doc.querySelectorAll('[itemtype*="schema.org/Recipe"]')
  if (recipeElements.length === 0) return []

  const recipes = []
  for (const el of recipeElements) {
    const recipe = extractItemScope(el)
    recipe['@type'] = 'Recipe'
    recipes.push(recipe)
  }

  return recipes
}

// --- Lightweight normalizer for extension ---

function normalizeForExtension(raw, url) {
  const title = raw.name || raw.headline || 'Untitled Recipe'
  const sourceDomain = new URL(url).hostname.replace(/^www\./, '')

  let author = null
  if (raw.author) {
    if (typeof raw.author === 'string') author = raw.author
    else if (raw.author.name) author = raw.author.name
    else if (Array.isArray(raw.author) && raw.author[0]?.name) author = raw.author[0].name
  }

  let imageUrl = null
  if (raw.image) {
    if (typeof raw.image === 'string') imageUrl = raw.image
    else if (raw.image.url) imageUrl = raw.image.url
    else if (Array.isArray(raw.image) && raw.image[0]) {
      imageUrl = typeof raw.image[0] === 'string' ? raw.image[0] : raw.image[0].url || null
    }
  }

  const ingredients = []
  const rawIngredients = raw.recipeIngredient || raw.ingredients || []
  for (const ing of rawIngredients) {
    if (typeof ing === 'string') {
      ingredients.push(ing.trim())
    }
  }

  const steps = []
  const rawSteps = raw.recipeInstructions || []
  if (typeof rawSteps === 'string') {
    rawSteps.split(/\n+/).forEach((s, i) => {
      const text = s.trim()
      if (text) steps.push({ order: i + 1, text })
    })
  } else if (Array.isArray(rawSteps)) {
    rawSteps.forEach((s, i) => {
      if (typeof s === 'string') {
        steps.push({ order: i + 1, text: s.trim() })
      } else if (s.text) {
        steps.push({ order: i + 1, text: s.text.trim() })
      }
    })
  }

  return {
    title,
    sourceUrl: url,
    sourceDomain,
    author,
    description: raw.description || null,
    imageUrl,
    servings: null,
    servingsText: raw.recipeYield
      ? Array.isArray(raw.recipeYield) ? raw.recipeYield[0] : raw.recipeYield
      : null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    rawIngredients: ingredients,
    rawSteps: steps,
    keywords: raw.keywords
      ? (typeof raw.keywords === 'string' ? raw.keywords.split(',').map(k => k.trim()) : raw.keywords)
      : [],
    cuisines: raw.recipeCuisine
      ? (typeof raw.recipeCuisine === 'string' ? [raw.recipeCuisine] : raw.recipeCuisine)
      : [],
    categories: raw.recipeCategory
      ? (typeof raw.recipeCategory === 'string' ? [raw.recipeCategory] : raw.recipeCategory)
      : [],
    extractionLayer: 'json-ld',
  }
}

// --- Message listener ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'EXTRACT_RECIPE') return false

  try {
    const html = document.documentElement.outerHTML
    const url = window.location.href

    // Layer 1: JSON-LD
    let recipes = extractJsonLd(html)
    let layer = 'json-ld'

    // Layer 2: Microdata
    if (recipes.length === 0) {
      recipes = extractMicrodata(html)
      layer = 'microdata'
    }

    if (recipes.length > 0) {
      const normalized = normalizeForExtension(recipes[0], url)
      normalized.extractionLayer = layer
      sendResponse({ type: 'RECIPE_DATA', recipe: normalized })
    } else {
      sendResponse({ type: 'NO_RECIPE' })
    }
  } catch {
    sendResponse({ type: 'NO_RECIPE' })
  }

  return true
})
