/** Common prep words that appear before or after ingredient names. */
const TRAILING_PREP_WORDS = [
  'chopped', 'diced', 'minced', 'sliced', 'crushed', 'grated',
  'shredded', 'julienned', 'cubed', 'halved', 'quartered',
  'torn', 'crumbled', 'ground', 'mashed', 'peeled', 'cored',
  'seeded', 'deveined', 'trimmed', 'pitted', 'zested', 'sifted',
  'finely chopped', 'finely diced', 'finely minced', 'finely sliced',
  'roughly chopped', 'coarsely chopped', 'thinly sliced',
  'freshly ground', 'freshly grated', 'freshly squeezed',
  'lightly packed', 'firmly packed',
  'melted', 'softened', 'room temperature',
  'toasted', 'roasted', 'sauteed', 'blanched', 'drained', 'rinsed',
  'drained and rinsed', 'peeled and deveined',
  'beaten', 'whisked', 'lightly beaten', 'well beaten',
  'cut into wedges', 'cut into chunks', 'cut into cubes',
  'at room temperature',
  'thawed', 'frozen', 'cooked', 'uncooked', 'raw',
  'divided', 'plus more', 'plus more for serving',
  'for garnish', 'for serving', 'to taste', 'as needed',
  'at room temperature', 'warmed', 'cooled', 'chilled',
]

/**
 * Leading prep phrases: only multi-word preps that clearly aren't
 * part of compound ingredient names (e.g. "freshly ground" is prep,
 * but bare "ground" could be part of "ground beef").
 */
const LEADING_PREP_WORDS = [
  'finely chopped', 'finely diced', 'finely minced', 'finely sliced',
  'roughly chopped', 'coarsely chopped', 'thinly sliced',
  'freshly ground', 'freshly grated', 'freshly squeezed',
  'lightly packed', 'firmly packed',
]

// Sort by length (longest first) for greedy matching
const SORTED_TRAILING = TRAILING_PREP_WORDS.sort((a, b) => b.length - a.length)
const SORTED_LEADING = LEADING_PREP_WORDS.sort((a, b) => b.length - a.length)

export interface PrepResult {
  ingredient: string
  prep: string | null
  optional: boolean
}

/**
 * Split prep instructions from ingredient name.
 * Handles trailing ("onions, finely diced") and leading ("freshly ground black pepper") prep.
 * Also handles trailing prep without comma ("salt to taste").
 * Detects "optional" keyword.
 */
export function parsePrepNotes(text: string): PrepResult {
  let remaining = text.trim()
  let optional = false
  const preps: string[] = []

  // Detect and remove "optional"
  if (/\boptional\b/i.test(remaining)) {
    optional = true
    remaining = remaining.replace(/,?\s*optional\b/i, '').trim()
  }

  // Handle trailing prep after comma: "onions, finely diced"
  const commaIndex = remaining.indexOf(',')
  if (commaIndex > 0) {
    const beforeComma = remaining.slice(0, commaIndex).trim()
    const afterComma = remaining.slice(commaIndex + 1).trim()

    // Check if the part after comma is a prep phrase
    const afterLower = afterComma.toLowerCase()
    let isPrepPhrase = false

    for (const prep of SORTED_TRAILING) {
      if (afterLower === prep || afterLower.startsWith(prep)) {
        isPrepPhrase = true
        preps.push(afterComma)
        break
      }
    }

    if (isPrepPhrase) {
      remaining = beforeComma
    }
  }

  // Handle trailing prep without comma: "salt and pepper to taste", "parsley for garnish"
  if (preps.length === 0) {
    const lower = remaining.toLowerCase()
    for (const prep of SORTED_TRAILING) {
      // Only match trailing prep phrases (multi-word or known end-of-line preps)
      if (lower.endsWith(' ' + prep)) {
        preps.push(remaining.slice(remaining.length - prep.length))
        remaining = remaining.slice(0, remaining.length - prep.length).trim()
        break
      }
    }
  }

  // Handle leading prep: "freshly ground black pepper" (multi-word preps only)
  if (preps.length === 0) {
    const lower = remaining.toLowerCase()
    for (const prep of SORTED_LEADING) {
      if (lower.startsWith(prep + ' ')) {
        preps.push(remaining.slice(0, prep.length))
        remaining = remaining.slice(prep.length).trim()
        break
      }
    }
  }

  return {
    ingredient: remaining.trim(),
    prep: preps.length > 0 ? preps.join(', ') : null,
    optional,
  }
}
