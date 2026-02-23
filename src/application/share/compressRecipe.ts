import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

const SHARE_BASE = 'https://mise.swinch.dev/api/r'
const MAX_URL_LENGTH = 6000

/**
 * Compact share payload — short keys to minimize compressed size.
 * Only includes what schema.org/Recipe needs.
 */
export interface SharePayload {
  /** title */
  t: string
  /** author */
  a?: string
  /** description */
  d?: string
  /** imageUrl */
  img?: string
  /** servings */
  sv?: number
  /** prepTimeMinutes */
  pt?: number
  /** cookTimeMinutes */
  ct?: number
  /** totalTimeMinutes */
  tt?: number
  /** ingredients (raw text) */
  ig: string[]
  /** steps (text) */
  st: string[]
  /** nutrition */
  n?: {
    cal?: number
    fat?: number
    satFat?: number
    carb?: number
    fiber?: number
    sugar?: number
    protein?: number
    chol?: number
    sodium?: number
  }
  /** keywords */
  kw?: string[]
  /** cuisines */
  cu?: string[]
  /** categories */
  cat?: string[]
  /** sourceUrl */
  src?: string
}

/** Strip internal fields, keep only schema.org-relevant data with short keys. */
export function recipeToSharePayload(recipe: Recipe | SavedRecipe): SharePayload {
  const payload: SharePayload = {
    t: recipe.title,
    ig: recipe.ingredients.map((i) => i.raw),
    st: recipe.steps.map((s) => s.text),
  }

  if (recipe.author) payload.a = recipe.author
  if (recipe.description) payload.d = recipe.description
  if (recipe.imageUrl) payload.img = recipe.imageUrl
  if (recipe.servings) payload.sv = recipe.servings
  if (recipe.prepTimeMinutes) payload.pt = recipe.prepTimeMinutes
  if (recipe.cookTimeMinutes) payload.ct = recipe.cookTimeMinutes
  if (recipe.totalTimeMinutes) payload.tt = recipe.totalTimeMinutes
  if (recipe.sourceUrl) payload.src = recipe.sourceUrl
  if (recipe.keywords.length > 0) payload.kw = recipe.keywords
  if (recipe.cuisines.length > 0) payload.cu = recipe.cuisines
  if (recipe.categories.length > 0) payload.cat = recipe.categories

  if (recipe.nutrition) {
    const n = recipe.nutrition
    const nutrition: SharePayload['n'] = {}
    if (n.calories != null) nutrition.cal = n.calories
    if (n.fatG != null) nutrition.fat = n.fatG
    if (n.saturatedFatG != null) nutrition.satFat = n.saturatedFatG
    if (n.carbohydrateG != null) nutrition.carb = n.carbohydrateG
    if (n.fiberG != null) nutrition.fiber = n.fiberG
    if (n.sugarG != null) nutrition.sugar = n.sugarG
    if (n.proteinG != null) nutrition.protein = n.proteinG
    if (n.cholesterolMg != null) nutrition.chol = n.cholesterolMg
    if (n.sodiumMg != null) nutrition.sodium = n.sodiumMg
    if (Object.keys(nutrition).length > 0) payload.n = nutrition
  }

  return payload
}

/** Compress JSON string → gzip → base64url */
export async function compressPayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)

  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()

  const chunks: Uint8Array[] = []
  const reader = cs.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const compressed = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    compressed.set(chunk, offset)
    offset += chunk.length
  }

  // base64url encode (no padding)
  const base64 = btoa(String.fromCharCode(...compressed))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build the full share URL, progressively stripping fields if too long. */
export async function buildShareUrl(recipe: Recipe | SavedRecipe): Promise<string> {
  const payload = recipeToSharePayload(recipe)

  // Try full payload first
  let encoded = await compressPayload(payload)
  let url = `${SHARE_BASE}?d=${encoded}`
  if (url.length <= MAX_URL_LENGTH) return url

  // Strip description
  delete payload.d
  encoded = await compressPayload(payload)
  url = `${SHARE_BASE}?d=${encoded}`
  if (url.length <= MAX_URL_LENGTH) return url

  // Strip nutrition
  delete payload.n
  encoded = await compressPayload(payload)
  url = `${SHARE_BASE}?d=${encoded}`
  if (url.length <= MAX_URL_LENGTH) return url

  // Strip image
  delete payload.img
  encoded = await compressPayload(payload)
  url = `${SHARE_BASE}?d=${encoded}`
  return url
}
