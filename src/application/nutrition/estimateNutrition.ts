import type { Ingredient, Range } from '@domain/models/Ingredient.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition, NormalizedIngredient } from '@domain/models/RecipeNutrition.ts'
import { WEIGHT_TO_G, VOLUME_TO_TSP, isWeightUnit, isVolumeUnit } from '@domain/constants/units.ts'
import staplesData from '../../data/usda-staples.json'
import { normalizeIngredients, buildNormalizedNameMap } from './normalizeIngredients.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Macros {
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
}

interface StapleEntry {
  fdcId: number
  per100g: Macros
}

interface IngredientMatch {
  ingredient: string
  macros: Macros | null
  confidence: 'high' | 'medium' | 'low'
}

// USDA nutrient IDs we care about
const NUTRIENT_IDS: Record<string, keyof Macros> = {
  '1008': 'calories',
  '1003': 'protein',
  '1004': 'fat',
  '1005': 'carbs',
  '1079': 'fiber',
}

// ---------------------------------------------------------------------------
// Staples cache
// ---------------------------------------------------------------------------

const staples: Record<string, StapleEntry> = Object.fromEntries(
  Object.entries(staplesData).filter(([k]) => k !== '_meta'),
) as Record<string, StapleEntry>

/** Normalize an ingredient name for staple lookup: lowercase, trim, strip trailing "s" for plurals. */
function normalizeForLookup(name: string): string {
  const cleaned = name.toLowerCase().trim()
    .replace(/\s*\(.*?\)\s*/g, ' ') // remove parentheticals
    .replace(/,.*$/, '')            // remove everything after comma
    .replace(/\s*\/\s*.+$/, '')     // remove slash alternatives ("green onions / spring onions" → "green onions")
    .trim()
  return cleaned
}

// Trailing words to strip when looking up staples (e.g. "garlic cloves" → "garlic")
const SUFFIX_NOISE = [' cloves', ' clove', ' stalks', ' stalk', ' leaves', ' leaf', ' pieces', ' piece', ' heads', ' head', ' sprigs', ' sprig']

// Generic ingredient aliases that map to common staples
const GENERIC_ALIASES: Record<string, string> = {
  oil: 'vegetable oil',
  'cooking oil': 'vegetable oil',
  'neutral oil': 'vegetable oil',
  pepper: 'black pepper',
  onions: 'onion',
  tomatoes: 'tomato',
  potatoes: 'potato',
  'spring onion': 'green onion',
  'spring onions': 'green onion',
  scallion: 'green onion',
  scallions: 'green onion',
}

function lookupStaple(ingredientName: string): StapleEntry | null {
  const name = normalizeForLookup(ingredientName)

  // Direct match
  if (staples[name]) return staples[name]

  // Try without trailing 's'
  if (name.endsWith('s') && staples[name.slice(0, -1)]) {
    return staples[name.slice(0, -1)]
  }

  // Try generic aliases
  if (GENERIC_ALIASES[name] && staples[GENERIC_ALIASES[name]]) {
    return staples[GENERIC_ALIASES[name]]
  }

  // Try stripping suffix noise ("garlic cloves" → "garlic")
  for (const suffix of SUFFIX_NOISE) {
    if (name.endsWith(suffix)) {
      const stripped = name.slice(0, -suffix.length)
      if (staples[stripped]) return staples[stripped]
      if (stripped.endsWith('s') && staples[stripped.slice(0, -1)]) {
        return staples[stripped.slice(0, -1)]
      }
    }
  }

  // Try common prefix removal: "fresh ", "dried ", "frozen ", "chopped ", "minced "
  const prefixes = ['fresh ', 'dried ', 'frozen ', 'chopped ', 'minced ', 'diced ', 'sliced ', 'shredded ', 'grated ', 'ground ', 'raw ', 'cooked ', 'canned ', 'boneless skinless ', 'boneless ', 'skinless ', 'crushed ']
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length)
      if (staples[stripped]) return staples[stripped]
      if (stripped.endsWith('s') && staples[stripped.slice(0, -1)]) {
        return staples[stripped.slice(0, -1)]
      }
      // Also try alias on the stripped name
      if (GENERIC_ALIASES[stripped] && staples[GENERIC_ALIASES[stripped]]) {
        return staples[GENERIC_ALIASES[stripped]]
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Volume-to-gram density table (grams per teaspoon)
// For converting volume measurements to weight when no USDA portion data
// ---------------------------------------------------------------------------

const DENSITY_G_PER_TSP: Record<string, number> = {
  // Liquids (~5g/tsp ≈ water density)
  water: 5.0,
  milk: 5.1,
  'whole milk': 5.1,
  'skim milk': 5.1,
  buttermilk: 5.1,
  'heavy cream': 5.0,
  'half and half': 5.0,
  'sour cream': 5.1,
  yogurt: 5.1,
  'greek yogurt': 5.5,
  broth: 5.0,
  stock: 5.0,
  'chicken broth': 5.0,
  'chicken stock': 5.0,
  'beef broth': 5.0,
  'beef stock': 5.0,
  'vegetable broth': 5.0,
  'vegetable stock': 5.0,
  wine: 5.0,
  'white wine': 5.0,
  'red wine': 5.0,
  beer: 5.0,
  'coconut milk': 5.0,
  'canned coconut milk': 5.0,
  vinegar: 5.0,
  'apple cider vinegar': 5.0,
  'balsamic vinegar': 5.3,
  'rice vinegar': 5.0,
  'soy sauce': 5.3,
  'fish sauce': 5.3,
  'lemon juice': 5.1,
  'lime juice': 5.1,
  'orange juice': 5.2,
  honey: 7.1,
  'maple syrup': 6.6,
  molasses: 6.9,
  ketchup: 5.1,
  'tomato sauce': 5.1,
  'tomato paste': 5.3,
  salsa: 5.1,

  // Oils (~4.6g/tsp)
  'olive oil': 4.5,
  'extra virgin olive oil': 4.5,
  'vegetable oil': 4.5,
  'canola oil': 4.5,
  'coconut oil': 4.5,
  'sesame oil': 4.5,

  // Flours & powders
  flour: 2.6,
  'all-purpose flour': 2.6,
  'whole wheat flour': 2.5,
  cornstarch: 2.7,
  cornmeal: 2.5,
  sugar: 4.2,
  'white sugar': 4.2,
  'brown sugar': 4.6,
  'powdered sugar': 2.5,
  'cocoa powder': 1.8,
  'baking powder': 4.6,
  'baking soda': 4.6,
  'garlic powder': 2.8,
  'onion powder': 2.4,
  cinnamon: 2.6,
  cumin: 2.1,
  paprika: 2.3,
  'chili powder': 2.6,
  oregano: 1.0,
  'dried basil': 0.7,
  'dried thyme': 0.9,
  turmeric: 3.0,
  'cayenne pepper': 1.8,
  'red pepper flakes': 1.5,
  'italian seasoning': 0.9,

  // Butter / spreads
  butter: 4.7,
  'unsalted butter': 4.7,
  'cream cheese': 4.8,
  mayonnaise: 4.7,
  'peanut butter': 5.3,
  mustard: 5.0,
  'dijon mustard': 5.0,

  // Grains (cooked)
  rice: 3.9,
  'white rice': 3.9,
  'brown rice': 3.9,
  'jasmine rice': 3.9,
  oats: 1.6,
  oatmeal: 1.6,
  quinoa: 3.5,
  couscous: 3.3,
  breadcrumbs: 2.3,
  panko: 1.2,

  // Default fallback for unknown ingredients
  _default: 4.0,
}

/** Get density in grams per teaspoon for an ingredient. */
function getDensity(ingredientName: string): number {
  const name = normalizeForLookup(ingredientName)
  if (DENSITY_G_PER_TSP[name]) return DENSITY_G_PER_TSP[name]

  // Try without prefix
  const prefixes = ['fresh ', 'dried ', 'frozen ', 'chopped ', 'minced ', 'diced ']
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length)
      if (DENSITY_G_PER_TSP[stripped]) return DENSITY_G_PER_TSP[stripped]
    }
  }

  return DENSITY_G_PER_TSP._default
}

// ---------------------------------------------------------------------------
// Average weight per "piece" for count-based ingredients (grams)
// ---------------------------------------------------------------------------

const PIECE_WEIGHT_G: Record<string, number> = {
  egg: 50,
  eggs: 50,
  banana: 118,
  apple: 182,
  lemon: 58,
  lime: 67,
  orange: 131,
  onion: 150,
  'yellow onion': 150,
  'red onion': 150,
  shallot: 30,
  potato: 150,
  potatoes: 150,
  'sweet potato': 130,
  tomato: 123,
  tomatoes: 123,
  carrot: 61,
  carrots: 61,
  celery: 40, // one stalk
  avocado: 150,
  'bell pepper': 150,
  'red bell pepper': 150,
  'green bell pepper': 150,
  jalapeno: 14,
  cucumber: 300,
  zucchini: 200,
  eggplant: 458,
  'chicken breast': 174,
  'chicken thigh': 116,
  'chicken drumstick': 105,
  'pork chop': 170,
}

// Units that mean "count" (no unit, or piece-like units)
const COUNT_UNITS = new Set([null, 'piece', 'whole', 'large', 'medium', 'small', 'clove', 'head', 'stalk', 'stick', 'bunch', 'sprig'])

// ---------------------------------------------------------------------------
// Quantity to grams conversion
// ---------------------------------------------------------------------------

function qtyToGrams(qty: number | Range | null, unit: string | null, ingredientName: string): number | null {
  if (qty === null) return null

  const numQty = typeof qty === 'object' ? (qty.min + qty.max) / 2 : qty

  const canonical = unit // already canonical from parser

  // Weight units → direct conversion
  if (canonical && isWeightUnit(canonical)) {
    return numQty * WEIGHT_TO_G[canonical]
  }

  // Volume units → convert to tsp, then use density
  if (canonical && isVolumeUnit(canonical)) {
    const tsp = numQty * VOLUME_TO_TSP[canonical]
    const density = getDensity(ingredientName)
    return tsp * density
  }

  // Count-based units (no unit, "piece", "clove", etc.)
  if (COUNT_UNITS.has(canonical)) {
    const name = normalizeForLookup(ingredientName)

    // Special case: "clove" of garlic = ~3g
    if (canonical === 'clove') return numQty * 3

    // Special case: "head" of garlic = ~40g, lettuce/cabbage = ~500g
    if (canonical === 'head') {
      if (name.includes('garlic')) return numQty * 40
      return numQty * 500
    }

    // Special case: "stalk" of celery = ~40g
    if (canonical === 'stalk') return numQty * 40

    // Special case: "stick" of butter = 113g
    if (canonical === 'stick' && name.includes('butter')) return numQty * 113

    // Special case: "bunch" ≈ 100g for herbs, 250g for greens
    if (canonical === 'bunch') {
      const herbs = ['parsley', 'cilantro', 'dill', 'basil', 'thyme', 'rosemary', 'mint']
      if (herbs.some((h) => name.includes(h))) return numQty * 30
      return numQty * 150
    }

    // "sprig" for herbs ≈ 2g
    if (canonical === 'sprig') return numQty * 2

    // "large" / "medium" / "small" scale the piece weight
    const sizeMultiplier = canonical === 'large' ? 1.25 : canonical === 'small' ? 0.75 : 1.0

    // Look up piece weight
    if (PIECE_WEIGHT_G[name]) return numQty * PIECE_WEIGHT_G[name] * sizeMultiplier
    if (name.endsWith('s') && PIECE_WEIGHT_G[name.slice(0, -1)]) {
      return numQty * PIECE_WEIGHT_G[name.slice(0, -1)] * sizeMultiplier
    }

    // Unknown count item — can't convert
    return null
  }

  // Container units (can, jar, package, etc.) — can't reliably convert
  return null
}

// ---------------------------------------------------------------------------
// USDA API fallback (client-side)
// ---------------------------------------------------------------------------

const USDA_API_KEY = 'J7H4cSY59DnmvORX1cvextyHCS7zpKNGfIJ2rj2V'
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

async function searchUSDA(ingredientName: string): Promise<{ macros: Macros; confidence: 'medium' | 'low' } | null> {
  try {
    const params = new URLSearchParams({
      query: ingredientName,
      dataType: 'Survey (FNDDS),SR Legacy',
      pageSize: '1',
      api_key: USDA_API_KEY,
    })

    const response = await fetch(`${USDA_SEARCH_URL}?${params}`)
    if (!response.ok) return null

    const data = await response.json()
    if (!data.foods || data.foods.length === 0) return null

    const food = data.foods[0]
    const macros: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }

    for (const nutrient of food.foodNutrients || []) {
      const key = NUTRIENT_IDS[String(nutrient.nutrientId)]
      if (key) {
        macros[key] = nutrient.value ?? 0
      }
    }

    // Check if the top result is a reasonable match
    const queryLower = ingredientName.toLowerCase()
    const descLower = (food.description || '').toLowerCase()
    const confidence = descLower.includes(queryLower) ? 'medium' as const : 'low' as const

    return { macros, confidence }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main estimation function
// ---------------------------------------------------------------------------

async function estimateIngredient(
  ingredient: Ingredient,
  normalizedEntry?: NormalizedIngredient,
): Promise<IngredientMatch> {
  const name = ingredient.ingredient
  const lookupName = normalizedEntry?.name ?? name

  // SKIP: zero-nutrition seasonings — count as matched with zero macros
  if (normalizedEntry?.action === 'SKIP') {
    return {
      ingredient: name,
      macros: { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
      confidence: 'high',
    }
  }

  // ESTIMATE_QUANTITY: use defaultGrams if qty is missing
  const effectiveQty = (ingredient.qty === null && normalizedEntry?.action === 'ESTIMATE_QUANTITY' && normalizedEntry.defaultGrams)
    ? normalizedEntry.defaultGrams
    : null

  // 1. Try staples cache (high confidence) — use normalized name for lookup
  const staple = lookupStaple(lookupName)
  if (staple) {
    let grams = qtyToGrams(ingredient.qty, ingredient.unitCanonical, lookupName)
    // If qty conversion failed but we have a default from ESTIMATE_QUANTITY, use it
    if ((grams === null || grams <= 0) && effectiveQty) {
      grams = effectiveQty
    }
    if (grams !== null && grams > 0) {
      const factor = grams / 100
      return {
        ingredient: name,
        macros: {
          calories: Math.round(staple.per100g.calories * factor),
          protein: Math.round(staple.per100g.protein * factor * 10) / 10,
          fat: Math.round(staple.per100g.fat * factor * 10) / 10,
          carbs: Math.round(staple.per100g.carbs * factor * 10) / 10,
          fiber: Math.round(staple.per100g.fiber * factor * 10) / 10,
        },
        confidence: 'high',
      }
    }
    // Have the staple data but can't convert qty — still partial match
    return { ingredient: name, macros: null, confidence: 'low' }
  }

  // 2. Try USDA API fallback (medium/low confidence) — use normalized name
  const usdaResult = await searchUSDA(lookupName)
  if (usdaResult) {
    let grams = qtyToGrams(ingredient.qty, ingredient.unitCanonical, lookupName)
    if ((grams === null || grams <= 0) && effectiveQty) {
      grams = effectiveQty
    }
    if (grams !== null && grams > 0) {
      const factor = grams / 100
      return {
        ingredient: name,
        macros: {
          calories: Math.round(usdaResult.macros.calories * factor),
          protein: Math.round(usdaResult.macros.protein * factor * 10) / 10,
          fat: Math.round(usdaResult.macros.fat * factor * 10) / 10,
          carbs: Math.round(usdaResult.macros.carbs * factor * 10) / 10,
          fiber: Math.round(usdaResult.macros.fiber * factor * 10) / 10,
        },
        confidence: usdaResult.confidence,
      }
    }
  }

  // 3. No match
  return { ingredient: name, macros: null, confidence: 'low' }
}

/**
 * Estimate per-recipe nutrition from parsed ingredients.
 * Optionally accepts pre-computed normalized names (e.g. from Describe recipes).
 * Returns null if too few ingredients can be matched.
 */
export async function estimateNutrition(
  recipe: Recipe | SavedRecipe,
  preNormalized?: NormalizedIngredient[] | null,
): Promise<RecipeNutrition | null> {
  const ingredients = recipe.ingredients

  if (ingredients.length === 0) return null

  // Use pre-computed usdaNames from Describe recipes, or run LLM normalization
  let normalized: NormalizedIngredient[] | null
  let normSource: string
  if (preNormalized !== undefined) {
    normalized = preNormalized
    normSource = 'preNormalized'
  } else if (recipe.usdaNames && Object.keys(recipe.usdaNames).length > 0) {
    // Convert usdaNames map to NormalizedIngredient[] — skip LLM call
    normalized = ingredients.map((ing) => ({
      raw: ing.raw,
      name: recipe.usdaNames![ing.raw] ?? ing.ingredient,
      action: 'MATCH' as const,
    }))
    normSource = 'usdaNames'
  } else {
    normalized = await normalizeIngredients(ingredients)
    normSource = 'llm'
  }

  console.log(`[Mise:Nutrition] normalization source: ${normSource}, result:`, normalized ? `${normalized.length} entries` : 'null (fallback to raw names)')

  const nameMap = buildNormalizedNameMap(normalized)

  // Log the name mapping for each ingredient
  for (const ing of ingredients) {
    const entry = nameMap[ing.raw]
    const lookupName = entry?.name ?? ing.ingredient
    console.log(`[Mise:Nutrition]   "${ing.ingredient}" → "${lookupName}" (${entry?.action ?? 'raw'})`)
  }

  const results = await Promise.all(
    ingredients.map((ing) => estimateIngredient(ing, nameMap[ing.raw])),
  )

  const matched = results.filter((r) => r.macros !== null)
  if (matched.length === 0) return null

  // Sum all matched ingredient macros
  const total: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  for (const result of matched) {
    if (result.macros) {
      total.calories += result.macros.calories
      total.protein += result.macros.protein
      total.fat += result.macros.fat
      total.carbs += result.macros.carbs
      total.fiber += result.macros.fiber
    }
  }

  // Per-serving values
  const servings = recipe.servings ?? 1
  const perServing: Macros = {
    calories: Math.round(total.calories / servings),
    protein: Math.round(total.protein / servings * 10) / 10,
    fat: Math.round(total.fat / servings * 10) / 10,
    carbs: Math.round(total.carbs / servings * 10) / 10,
    fiber: Math.round(total.fiber / servings * 10) / 10,
  }

  // Overall confidence: high if >70% matched from staples, medium if >50%, low otherwise
  // SKIP items count as high-confidence matches
  const highCount = results.filter((r) => r.confidence === 'high' && r.macros).length
  const matchRate = matched.length / ingredients.length
  const highRate = highCount / ingredients.length

  let confidence: 'high' | 'medium' | 'low'
  if (highRate >= 0.7 && matchRate >= 0.8) {
    confidence = 'high'
  } else if (matchRate >= 0.5) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  const perIngredient = results.map((r) => ({
    ingredient: r.ingredient,
    calories: r.macros?.calories ?? null,
    protein: r.macros?.protein ?? null,
    fat: r.macros?.fat ?? null,
    carbs: r.macros?.carbs ?? null,
    fiber: r.macros?.fiber ?? null,
    matched: r.macros !== null,
  }))

  // Build normalized name map for caching
  const normalizedNames: Record<string, string> = {}
  if (normalized) {
    for (const entry of normalized) {
      normalizedNames[entry.raw] = entry.name
    }
  }

  return {
    perServing,
    perIngredient,
    confidence,
    computedAt: new Date().toISOString(),
    ingredientCount: ingredients.length,
    matchedCount: matched.length,
    ...(Object.keys(normalizedNames).length > 0 ? { normalizedNames } : {}),
  }
}

// Export helpers for testing
export { lookupStaple, qtyToGrams, normalizeForLookup }
