import type { Ingredient, Range } from '@domain/models/Ingredient.ts'
import { convertUnit } from './convertUnit.ts'

export interface ScaledIngredient extends Ingredient {
  scaledQty: number | Range | null
  displayUnit: string | null
}

/**
 * Scale ingredient quantities by a ratio.
 * - Null qty -> unchanged (unmeasured items like "salt to taste")
 * - Range -> scale both bounds
 * - Optionally converts units when scaled result is awkward
 */
export function scaleIngredients(
  ingredients: Ingredient[],
  originalServings: number,
  targetServings: number,
): ScaledIngredient[] {
  if (originalServings <= 0 || targetServings <= 0) {
    return ingredients.map((ing) => ({
      ...ing,
      scaledQty: ing.qty,
      displayUnit: ing.unitCanonical,
    }))
  }

  const ratio = targetServings / originalServings

  return ingredients.map((ing) => {
    if (ing.qty === null) {
      return { ...ing, scaledQty: null, displayUnit: ing.unitCanonical }
    }

    // Scale range
    if (typeof ing.qty === 'object' && 'min' in ing.qty) {
      const scaledRange: Range = {
        min: ing.qty.min * ratio,
        max: ing.qty.max * ratio,
      }
      return { ...ing, scaledQty: scaledRange, displayUnit: ing.unitCanonical }
    }

    // Scale single quantity
    const scaledQty = ing.qty * ratio

    // Try unit conversion for awkward values
    if (ing.unitCanonical) {
      const converted = convertUnit(scaledQty, ing.unitCanonical)
      if (converted) {
        return { ...ing, scaledQty: converted.qty, displayUnit: converted.unit }
      }
    }

    return { ...ing, scaledQty, displayUnit: ing.unitCanonical }
  })
}
