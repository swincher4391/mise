import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { Nutrition } from '@domain/models/Nutrition.ts'
import { parseIngredients } from '@application/parser/IngredientParser.ts'

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
  // Don't await write/close — they block until the readable side drains.
  // Fire them, then read output. close() ensures the stream finishes.
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

  // base64url encode (no padding) — chunked to avoid call stack limits
  return uint8ToBase64url(compressed)
}

/** Convert Uint8Array to base64url string without padding. */
function uint8ToBase64url(bytes: Uint8Array): string {
  // Build binary string in chunks to avoid call stack limits
  const chunkSize = 8192
  let binaryStr = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binaryStr += String.fromCharCode.apply(null, Array.from(slice))
  }
  const base64 = btoa(binaryStr)
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

const MAX_QR_URL_LENGTH = 2900

/**
 * Build a share URL that fits within QR code capacity (~2,953 alphanumeric chars).
 * Strips fields more aggressively than buildShareUrl.
 * Returns null if the recipe is too large even after full stripping.
 */
export async function buildQrShareUrl(recipe: Recipe | SavedRecipe): Promise<string | null> {
  const payload = recipeToSharePayload(recipe)

  // Fields to strip in order of least importance
  const stripSteps: Array<() => void> = [
    () => { delete payload.d },
    () => { delete payload.n },
    () => { delete payload.img },
    () => { delete payload.kw },
    () => { delete payload.cu },
    () => { delete payload.cat },
    () => { delete payload.src },
    () => { delete payload.a },
  ]

  let encoded = await compressPayload(payload)
  let url = `${SHARE_BASE}?d=${encoded}`
  if (url.length <= MAX_QR_URL_LENGTH) return url

  for (const strip of stripSteps) {
    strip()
    encoded = await compressPayload(payload)
    url = `${SHARE_BASE}?d=${encoded}`
    if (url.length <= MAX_QR_URL_LENGTH) return url
  }

  // Still too long — recipe can't fit in a QR code
  return null
}

/** base64url → base64 → gunzip → JSON parse */
export async function decompressPayload(encoded: string): Promise<SharePayload> {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binaryStr = atob(base64)
  const compressed = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    compressed[i] = binaryStr.charCodeAt(i)
  }

  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(compressed)
  writer.close()

  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const decompressed = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    decompressed.set(chunk, offset)
    offset += chunk.length
  }

  const json = new TextDecoder().decode(decompressed)
  return JSON.parse(json) as SharePayload
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Reconstruct a full Recipe from a SharePayload. */
export function sharePayloadToRecipe(payload: SharePayload): Recipe {
  const id = `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const steps = payload.st.map((text, i) => ({
    id: `step_${i + 1}`,
    order: i + 1,
    text,
    timerSeconds: null,
    ingredientRefs: [],
  }))

  let nutrition: Nutrition | null = null
  if (payload.n) {
    const n = payload.n
    nutrition = {
      calories: n.cal ?? null,
      fatG: n.fat ?? null,
      saturatedFatG: n.satFat ?? null,
      carbohydrateG: n.carb ?? null,
      fiberG: n.fiber ?? null,
      sugarG: n.sugar ?? null,
      proteinG: n.protein ?? null,
      cholesterolMg: n.chol ?? null,
      sodiumMg: n.sodium ?? null,
    }
  }

  return {
    id,
    title: payload.t,
    sourceUrl: payload.src ?? '',
    sourceDomain: payload.src ? extractDomain(payload.src) : '',
    author: payload.a ?? null,
    description: payload.d ?? null,
    imageUrl: payload.img ?? null,
    servings: payload.sv ?? null,
    servingsText: payload.sv ? String(payload.sv) : null,
    prepTimeMinutes: payload.pt ?? null,
    cookTimeMinutes: payload.ct ?? null,
    totalTimeMinutes: payload.tt ?? null,
    ingredients: parseIngredients(payload.ig.filter((l) => l.trim())),
    steps,
    nutrition,
    keywords: payload.kw ?? [],
    cuisines: payload.cu ?? [],
    categories: payload.cat ?? [],
    tags: [],
    notes: null,
    favorite: false,
    extractedAt: new Date().toISOString(),
    extractionLayer: 'json-ld',
    parserVersion: '1.0.0',
    schemaVersion: 1,
  }
}

/** Decompress an encoded share string directly into a Recipe. */
export async function decompressToRecipe(encoded: string): Promise<Recipe> {
  const payload = await decompressPayload(encoded)
  return sharePayloadToRecipe(payload)
}
