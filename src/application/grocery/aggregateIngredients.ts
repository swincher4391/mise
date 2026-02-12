import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { Range } from '@domain/models/Ingredient.ts'
import type { GroceryItem, RecipeSource } from '@domain/models/GroceryItem.ts'
import type { SelectedRecipe } from '@domain/models/GroceryList.ts'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { convertUnit } from '@application/scaler/convertUnit.ts'
import { VOLUME_TO_TSP, WEIGHT_TO_G, isVolumeUnit, isWeightUnit } from '@domain/constants/units.ts'
import { lookupCategory } from '@domain/constants/categories.ts'
import { normalizeIngredientName } from './normalizeIngredientName.ts'

/** Category display order for sorting */
const CATEGORY_ORDER: Record<string, number> = {
  produce: 0,
  meat: 1,
  seafood: 2,
  dairy: 3,
  pantry: 4,
  spices: 5,
  frozen: 6,
  beverages: 7,
}

type UnitSystem = 'volume' | 'weight' | string // string = the canonical unit itself (e.g. "clove", "can")

interface AggBucket {
  displayName: string
  category: string | null
  totalBase: number         // sum in base units (tsp for volume, g for weight, raw for count)
  unitSystem: UnitSystem
  baseUnit: string | null   // canonical unit for converting back
  sources: RecipeSource[]
  notes: string[]
  allOptional: boolean
  hasNullQty: boolean       // "salt to taste" — never sum
}

function getUnitSystem(unit: string | null): UnitSystem | null {
  if (!unit) return null
  if (isVolumeUnit(unit)) return 'volume'
  if (isWeightUnit(unit)) return 'weight'
  return unit // count unit like "clove", "can", etc.
}

function toBaseUnits(qty: number, unit: string): number {
  if (isVolumeUnit(unit)) return qty * VOLUME_TO_TSP[unit]
  if (isWeightUnit(unit)) return qty * WEIGHT_TO_G[unit]
  return qty // count units — already in base
}

function fromBaseUnits(base: number, unitSystem: UnitSystem): { qty: number; unit: string } {
  if (unitSystem === 'volume') {
    // Start in teaspoons, let convertUnit find the best display
    const converted = convertUnit(base, 'teaspoon')
    if (converted) return converted
    return { qty: base, unit: 'teaspoon' }
  }
  if (unitSystem === 'weight') {
    const converted = convertUnit(base / WEIGHT_TO_G['gram'], 'gram')
    if (converted) return converted
    // If no better unit, show grams but only if reasonable
    const grams = base
    if (grams >= 1000) return { qty: grams / 1000, unit: 'kilogram' }
    if (grams >= 28) return { qty: grams / WEIGHT_TO_G['ounce'], unit: 'ounce' }
    return { qty: grams, unit: 'gram' }
  }
  // Count unit — return as-is
  return { qty: base, unit: unitSystem }
}

/**
 * Aggregate ingredients from selected recipes into a deduplicated grocery list.
 */
export function aggregateIngredients(
  recipes: SavedRecipe[],
  selectedRecipes: SelectedRecipe[],
): GroceryItem[] {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]))
  const buckets = new Map<string, AggBucket>()

  let idCounter = 0

  for (const sel of selectedRecipes) {
    const recipe = recipeMap.get(sel.recipeId)
    if (!recipe) continue

    const servings = recipe.servings ?? 1
    const target = sel.servingOverride ?? servings

    const scaled = scaleIngredients(recipe.ingredients, servings, target)

    for (const ing of scaled) {
      const normalized = normalizeIngredientName(ing.ingredient)
      const unitSystem = getUnitSystem(ing.displayUnit ?? ing.unitCanonical)
      const bucketKey = unitSystem ? `${normalized}|${unitSystem}` : `${normalized}|null`

      const source: RecipeSource = {
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        originalQty: ing.qty,
        originalUnit: ing.unit,
      }

      const existing = buckets.get(bucketKey)

      if (existing) {
        // Merge into existing bucket
        existing.sources.push(source)
        if (ing.notes) existing.notes.push(ing.notes)
        if (!ing.optional) existing.allOptional = false

        if (ing.scaledQty === null) {
          existing.hasNullQty = true
        } else if (!existing.hasNullQty) {
          const qty = typeof ing.scaledQty === 'object'
            ? (ing.scaledQty as Range).max
            : ing.scaledQty
          const unit = ing.displayUnit ?? ing.unitCanonical
          existing.totalBase += unit ? toBaseUnits(qty, unit) : qty
        }
      } else {
        // New bucket
        const hasNullQty = ing.scaledQty === null
        let totalBase = 0

        if (!hasNullQty && ing.scaledQty !== null) {
          const qty = typeof ing.scaledQty === 'object'
            ? (ing.scaledQty as Range).max
            : ing.scaledQty
          const unit = ing.displayUnit ?? ing.unitCanonical
          totalBase = unit ? toBaseUnits(qty, unit) : qty
        }

        const category = ing.category ?? lookupCategory(ing.ingredient)

        buckets.set(bucketKey, {
          displayName: ing.ingredient,
          category,
          totalBase,
          unitSystem: unitSystem ?? 'null',
          baseUnit: ing.displayUnit ?? ing.unitCanonical,
          sources: [source],
          notes: ing.notes ? [ing.notes] : [],
          allOptional: ing.optional,
          hasNullQty,
        })
      }
    }
  }

  // Convert buckets to GroceryItems
  const items: GroceryItem[] = []

  for (const bucket of buckets.values()) {
    let qty: number | null = null
    let unit: string | null = null

    if (!bucket.hasNullQty && bucket.totalBase > 0) {
      if (bucket.unitSystem === 'null' || !bucket.baseUnit) {
        // No unit — just the raw sum
        qty = bucket.totalBase
        unit = null
      } else {
        const result = fromBaseUnits(bucket.totalBase, bucket.unitSystem)
        qty = result.qty
        unit = result.unit
      }
    }

    items.push({
      id: `grocery-${++idCounter}`,
      ingredient: normalizeIngredientName(bucket.displayName),
      displayName: bucket.displayName,
      qty,
      unit,
      category: bucket.category,
      checked: false,
      sourceRecipes: bucket.sources,
      notes: bucket.notes.length > 0 ? [...new Set(bucket.notes)].join('; ') : null,
      optional: bucket.allOptional,
    })
  }

  // Sort by category order then alphabetically
  items.sort((a, b) => {
    const catA = a.category ? (CATEGORY_ORDER[a.category] ?? 99) : 99
    const catB = b.category ? (CATEGORY_ORDER[b.category] ?? 99) : 99
    if (catA !== catB) return catA - catB
    return a.displayName.localeCompare(b.displayName)
  })

  return items
}
