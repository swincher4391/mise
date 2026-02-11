import { VOLUME_TO_TSP, WEIGHT_TO_G, isVolumeUnit, isWeightUnit } from '@domain/constants/units.ts'

interface ConversionResult {
  qty: number
  unit: string
}

/**
 * Common cooking volume units (US), ordered smallest to largest.
 * Pint/quart excluded - home cooks think in tsp/tbsp/cup.
 */
const VOLUME_DISPLAY_ORDER: [string, number][] = [
  ['teaspoon', 1],
  ['tablespoon', 3],
  ['cup', 48],
]

/**
 * Common cooking weight units, ordered smallest to largest.
 */
const WEIGHT_DISPLAY_ORDER: [string, number][] = [
  ['ounce', 28.3495],
  ['pound', 453.592],
]

/** Known fraction values - these produce clean display. */
const CLEAN_FRACTIONS = [0.125, 0.167, 0.25, 0.333, 0.375, 0.5, 0.625, 0.667, 0.75, 0.833, 0.875]
const FRACTION_THRESHOLD = 0.02

/** Check if a value is "clean" (whole number or common fraction). */
function isCleanValue(value: number): boolean {
  if (value <= 0) return false
  const frac = value - Math.floor(value)
  if (frac < FRACTION_THRESHOLD) return true // whole number
  if (1 - frac < FRACTION_THRESHOLD) return true // close to whole
  return CLEAN_FRACTIONS.some((f) => Math.abs(frac - f) < FRACTION_THRESHOLD)
}

/** Score a conversion: lower is better. Prefer clean fractions and values 0.25-8. */
function scoreConversion(value: number): number {
  let score = 0
  if (!isCleanValue(value)) score += 10
  if (value < 0.125) score += 20 // too small
  if (value > 16) score += 15 // too large
  if (value >= 0.25 && value <= 8) score -= 5 // sweet spot
  return score
}

/**
 * Find the best display unit for a given value in base units.
 */
function findBestUnit(
  valueInBase: number,
  currentUnit: string,
  displayOrder: [string, number][],
  basePerCurrent: number,
): ConversionResult | null {
  const currentValue = valueInBase / basePerCurrent
  const currentScore = scoreConversion(currentValue)

  let best: ConversionResult | null = null
  let bestScore = currentScore

  // Iterate largest to smallest so ties prefer the larger unit
  for (let i = displayOrder.length - 1; i >= 0; i--) {
    const [unit, basePerUnit] = displayOrder[i]
    if (unit === currentUnit) continue
    const converted = valueInBase / basePerUnit
    const score = scoreConversion(converted)
    if (score < bestScore) {
      bestScore = score
      best = { qty: converted, unit }
    }
  }

  return best
}

/**
 * Convert a scaled quantity to a more sensible unit if the current
 * display is awkward (e.g., 0.25 cup -> 4 tbsp, 48 tsp -> 1 cup).
 *
 * Only converts within the same system (volume-to-volume, weight-to-weight).
 * Returns null if no conversion is needed or possible.
 */
export function convertUnit(qty: number, unit: string): ConversionResult | null {
  if (isVolumeUnit(unit)) {
    const tsp = qty * VOLUME_TO_TSP[unit]
    return findBestUnit(tsp, unit, VOLUME_DISPLAY_ORDER, VOLUME_TO_TSP[unit])
  }

  if (isWeightUnit(unit)) {
    const grams = qty * WEIGHT_TO_G[unit]
    return findBestUnit(grams, unit, WEIGHT_DISPLAY_ORDER, WEIGHT_TO_G[unit])
  }

  return null
}
