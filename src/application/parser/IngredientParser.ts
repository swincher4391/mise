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

  // Check if "optional" appeared in parenthetical and remove it from notes
  let optionalFromParen = false
  const filteredNotes = parenNotes.filter((note) => {
    if (/^optional$/i.test(note.trim())) {
      optionalFromParen = true
      return false
    }
    return true
  })

  // Step 3: Parse quantity
  const { qty, remainder: afterQty } = parseQuantity(withoutParens)

  // Step 4: Parse unit
  const { unitCanonical, remainder: afterUnit } = parseUnit(afterQty)

  // Step 5 & 6: Split prep/notes and detect optional
  const { ingredient, prep, optional } = parsePrepNotes(afterUnit)

  // Step 7: Category lookup
  const category = lookupCategory(ingredient)

  // Combine notes
  const allNotes = filteredNotes.length > 0 ? filteredNotes.join('; ') : null

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
    optional: optional || optionalFromParen,
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
