/**
 * Parse .paprikarecipes files into Mise Recipe objects.
 *
 * The .paprikarecipes format is a gzip-compressed archive containing
 * individual gzip-compressed JSON files, each representing one recipe.
 *
 * We use the browser's native DecompressionStream API for decompression.
 */
import type { Recipe } from '@domain/models/Recipe.ts'
import { parseIngredients } from '@application/parser/IngredientParser.ts'
import { extractPrimaryTimer } from '@application/parser/parseStepTimers.ts'
import { parseInformalDuration } from './parseInformalDuration.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

const PARSER_VERSION = '1.0.0'
const SCHEMA_VERSION = 1

interface PaprikaRecipe {
  name?: string
  source?: string
  source_url?: string
  servings?: string
  prep_time?: string
  cook_time?: string
  total_time?: string
  ingredients?: string
  directions?: string
  notes?: string
  categories?: string
  photo_data?: string
  rating?: number
  difficulty?: string
  nutritional_info?: string
  image_url?: string
}

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

function parseServingsFromString(text: string | undefined): { servings: number | null; servingsText: string | null } {
  if (!text) return { servings: null, servingsText: null }
  const servingsText = text
  const match = text.match(/(\d+)/)
  const servings = match ? parseInt(match[1], 10) : null
  return { servings, servingsText }
}

function directionsToSteps(text: string | undefined): Recipe['steps'] {
  if (!text) return []

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      // Strip leading numbering like "1.", "1)", "Step 1:"
      const cleaned = line.replace(/^(?:\d+[.)]\s*|step\s+\d+[:.]\s*)/i, '')
      return {
        id: `step_${i + 1}`,
        order: i + 1,
        text: cleaned,
        timerSeconds: extractPrimaryTimer(cleaned),
        ingredientRefs: [],
      }
    })
}

/**
 * Decompress a gzip-compressed ArrayBuffer using DecompressionStream.
 */
async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(new Uint8Array(data))
  writer.close()

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }

  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result.buffer
}

/**
 * Extract individual gzip entries from the outer archive.
 *
 * The .paprikarecipes format concatenates multiple gzip streams.
 * Each gzip stream starts with the magic bytes 0x1F 0x8B.
 * We split on these boundaries and decompress each individually.
 */
function findGzipBoundaries(data: Uint8Array): number[] {
  const boundaries: number[] = []
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0x1f && data[i + 1] === 0x8b) {
      boundaries.push(i)
    }
  }
  return boundaries
}

function mapPaprikaToRecipe(raw: PaprikaRecipe): Recipe {
  const { servings, servingsText } = parseServingsFromString(raw.servings)
  const sourceUrl = raw.source_url || ''

  const rawIngredients = (raw.ingredients || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    id: generateId(),
    title: raw.name || 'Untitled Recipe',
    sourceUrl,
    sourceDomain: extractDomain(sourceUrl),
    author: raw.source || null,
    description: null,
    imageUrl: raw.image_url || null,
    servings,
    servingsText,
    prepTimeMinutes: parseInformalDuration(raw.prep_time || ''),
    cookTimeMinutes: parseInformalDuration(raw.cook_time || ''),
    totalTimeMinutes: parseInformalDuration(raw.total_time || ''),
    ingredients: parseIngredients(rawIngredients),
    steps: directionsToSteps(raw.directions),
    nutrition: null,
    keywords: [],
    cuisines: [],
    categories: [],
    tags: (raw.categories || '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    notes: raw.notes || null,
    favorite: false,
    extractedAt: new Date().toISOString(),
    extractionLayer: 'manual',
    parserVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
  }
}

/**
 * Parse a .paprikarecipes file into Mise Recipe objects.
 */
export async function parsePaprikaFile(file: File): Promise<Recipe[]> {
  const arrayBuffer = await file.arrayBuffer()

  // First, decompress the outer gzip layer
  let outerData: ArrayBuffer
  try {
    outerData = await decompressGzip(arrayBuffer)
  } catch {
    // If outer decompression fails, the file might be a single recipe or invalid
    throw new Error('Failed to decompress .paprikarecipes file. The file may be corrupted.')
  }

  const outerBytes = new Uint8Array(outerData)

  // Find individual gzip entries
  const boundaries = findGzipBoundaries(outerBytes)
  if (boundaries.length === 0) {
    // Try to parse as plain text JSON (single recipe)
    try {
      const text = new TextDecoder().decode(outerData)
      const raw = JSON.parse(text) as PaprikaRecipe
      return [mapPaprikaToRecipe(raw)]
    } catch {
      throw new Error('No recipes found in file.')
    }
  }

  const recipes: Recipe[] = []

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : outerBytes.length
    const chunk = outerBytes.slice(start, end)

    try {
      const decompressed = await decompressGzip(chunk.buffer)
      const text = new TextDecoder().decode(decompressed)
      const raw = JSON.parse(text) as PaprikaRecipe
      recipes.push(mapPaprikaToRecipe(raw))
    } catch {
      // Skip invalid entries
      continue
    }
  }

  return recipes
}
