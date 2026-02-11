import type { Ingredient } from '@domain/models/Ingredient.ts'
import { lookupCategory } from '@domain/constants/categories.ts'
import { normalizeUnicodeFractions, parseQuantity } from './parseQuantity.ts'
import { parseUnit } from './parseUnit.ts'
import { parseParenthetical } from './parseParenthetical.ts'
import { parsePrepNotes } from './parsePrepNotes.ts'

let idCounter = 0

function generateId(): string {
  return `ing_${Date.now()}_${++idCounter}`
}

/**
 * Normalize whitespace and unicode fractions in raw ingredient text.
 */
function normalize(raw: string): string {
  let text = raw.trim()
  // Normalize unicode fractions
  text = normalizeUnicodeFractions(text)
  // Collapse multiple spaces
  text = text.replace(/\s+/g, ' ')
  return text
}

/**
 * Parse a raw ingredient string into a structured Ingredient object.
 *
 * Pipeline:
 * 1. Normalize whitespace + unicode fractions
 * 2. Extract parentheticals -> store as note candidates
 * 3. Parse quantity from front
 * 4. Parse unit from front of remainder
 * 5. Split on comma -> ingredient name vs prep/notes
 * 6. Detect "optional" keyword
 * 7. Category lookup from ingredient name
 * 8. Assemble Ingredient object
 */
export function parseIngredient(raw: string): Ingredient {
  // Step 1: Normalize
  const normalized = normalize(raw)

  // Step 2: Extract parentheticals
  const { text: withoutParens, notes: parenNotes } = parseParenthetical(normalized)

  // Step 3: Parse quantity
  const { qty, remainder: afterQty } = parseQuantity(withoutParens)

  // Step 4: Parse unit
  const { unitCanonical, remainder: afterUnit } = parseUnit(afterQty)

  // Step 5 & 6: Split prep/notes and detect optional
  const { ingredient, prep, optional } = parsePrepNotes(afterUnit)

  // Step 7: Category lookup
  const category = lookupCategory(ingredient)

  // Combine notes
  const allNotes = parenNotes.length > 0 ? parenNotes.join('; ') : null

  // Step 8: Assemble
  return {
    id: generateId(),
    raw,
    qty,
    unit: unitCanonical,
    unitCanonical,
    ingredient,
    prep,
    notes: allNotes,
    category,
    optional,
  }
}

/** Parse an array of raw ingredient strings. */
export function parseIngredients(rawList: string[]): Ingredient[] {
  return rawList.map(parseIngredient)
}

/** Reset the id counter (useful for testing). */
export function resetIdCounter(): void {
  idCounter = 0
}
