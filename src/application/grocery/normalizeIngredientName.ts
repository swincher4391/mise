/**
 * Normalize an ingredient name for aggregation/deduplication.
 * Lowercases, trims, and strips basic trailing plurals.
 */
export function normalizeIngredientName(name: string): string {
  let normalized = name.toLowerCase().trim()

  // Remove trailing 's' for basic plural stripping, but not for words
  // that naturally end in 's' (e.g., "hummus", "asparagus", "couscous")
  const noStripSuffixes = ['ss', 'us', 'is']
  if (
    normalized.length > 3 &&
    normalized.endsWith('s') &&
    !noStripSuffixes.some((s) => normalized.endsWith(s))
  ) {
    // Handle "ies" -> "y" (e.g., "berries" -> "berry")
    if (normalized.endsWith('ies')) {
      normalized = normalized.slice(0, -3) + 'y'
    }
    // Handle "ves" -> "f" (e.g., "halves" -> "half")
    else if (normalized.endsWith('ves')) {
      normalized = normalized.slice(0, -3) + 'f'
    }
    // Handle "oes" -> "o" (e.g., "tomatoes" -> "tomato", "potatoes" -> "potato")
    else if (normalized.endsWith('oes')) {
      normalized = normalized.slice(0, -2)
    }
    // Handle "es" after ch, sh, x, z (e.g., "bunches" -> "bunch")
    else if (
      normalized.endsWith('es') &&
      (normalized.endsWith('ches') || normalized.endsWith('shes') ||
       normalized.endsWith('xes') || normalized.endsWith('zes'))
    ) {
      normalized = normalized.slice(0, -2)
    }
    // Default: strip trailing 's'
    else {
      normalized = normalized.slice(0, -1)
    }
  }

  return normalized
}
