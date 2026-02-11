import { UNIT_MAP } from '@domain/constants/units.ts'

export interface UnitResult {
  unit: string | null
  unitCanonical: string | null
  remainder: string
}

// Build sorted keys for matching (longest first to avoid partial matches)
const UNIT_KEYS = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length)

/**
 * Parse a unit from the front of a string.
 * Case-insensitive. Handles plural forms via UNIT_MAP.
 * Returns canonical unit name or null for countable items.
 */
export function parseUnit(text: string): UnitResult {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  for (const key of UNIT_KEYS) {
    if (!lower.startsWith(key)) continue

    // Ensure we're matching a whole word (not partial)
    const nextChar = lower[key.length]
    if (nextChar && /[a-z]/.test(nextChar)) continue

    // Skip single-letter units that could be part of ingredient names
    // 'c' for cup, 't' for teaspoon, 'g' for gram, 'l' for liter
    // Only match these if followed by space/period/end or the next word looks like an ingredient
    if (key.length === 1) {
      // Single-letter unit: require it to be followed by space, period, or end
      if (nextChar && nextChar !== '.' && nextChar !== ' ') continue
    }

    const canonical = UNIT_MAP[key]
    const remainder = trimmed.slice(key.length).replace(/^\.?\s*/, '')
    return { unit: key, unitCanonical: canonical, remainder }
  }

  return { unit: null, unitCanonical: null, remainder: trimmed }
}
