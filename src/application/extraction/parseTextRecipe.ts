import { parseMasterCookRecipe } from './parseMasterCookRecipe.ts'

export interface ParsedTextRecipe {
  title: string
  ingredientLines: string[]
  stepLines: string[]
}

/**
 * Measurement units that signal ingredient text. Built from the same units
 * as the ingredient parser (domain/constants/units.ts) but as a regex
 * for fast matching in unstructured text.
 */
const INGREDIENT_UNITS = /\b(cups?|tbsps?|tsps?|tbs|tbl|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|gm|kg|kgs?|ml|mls?|liters?|litres?|pints?|quarts?|gallons?|fl\s*oz|pinch(?:es)?|dash(?:es)?|handfuls?|cloves?|bunch(?:es)?|sprigs?|stalks?|cans?|heads?|packages?|pkg|sticks?|pieces?|pcs?|slices?|bags?|bottles?|jars?|boxes?|drops?|whole|large|medium|small)\b/i

/**
 * Check if text starts with a quantity followed by a unit (with or without space).
 * Handles "1 cup", "1/2 lb", "6-8 oz", and also "1lb" (no space, common in social media).
 */
const QUANTITY_UNIT_START = /^[\d½¼¾⅓⅔][\d/.½¼¾⅓⅔-]*\s*(?:cups?|tbsps?|tsps?|tbs|tbl|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|gm|kg|kgs?|ml|mls?|liters?|litres?|pints?|quarts?|gallons?|fl\s*oz|pinch(?:es)?|dash(?:es)?|handfuls?|cloves?|bunch(?:es)?|sprigs?|stalks?|cans?|heads?|packages?|pkg|sticks?|pieces?|pcs?|slices?|bags?|bottles?|jars?|boxes?|drops?|whole|large|medium|small)\b/i

/**
 * Detect whether a line reads like an ingredient based on its content.
 * Looks for quantity + unit patterns, bare numbers + food words,
 * and common ingredient qualifiers like "to taste".
 */
function isLikelyIngredient(line: string): boolean {
  // Quantity + unit (handles "1 cup flour", "1lb chicken", "6-8 oz cheese")
  if (QUANTITY_UNIT_START.test(line)) return true
  // Fraction + food word without explicit unit: "1/2 yellow onion"
  if (/^[\d½¼¾⅓⅔][\d/.½¼¾⅓⅔-]+\s+[a-z]/i.test(line) && !COOKING_VERBS.test(line) && line.length < 60) return true
  // Number + food word without explicit unit: "2 eggs", "3 tomatoes"
  if (/^\d+\s+[a-z]/i.test(line) && !COOKING_VERBS.test(line) && line.length < 60) return true
  // Ingredient qualifiers: "Salt and pepper, to taste", "Parsley to garnish"
  if (/\b(to\s+taste|(?:to|for)\s+garnish(?:ing)?|as\s+needed)\b/i.test(line) && line.length < 80) return true
  return false
}

/**
 * Split a long text blob at ingredient boundaries.
 *
 * Social media captions often list ingredients as a single run-on line
 * without newlines or bullets. This detects quantity+unit patterns and
 * inserts line breaks so each ingredient lands on its own line.
 *
 * Only activates when the text contains 3+ quantity+unit matches,
 * ensuring we don't accidentally split normal prose.
 */
function splitAtIngredientBoundaries(text: string): string[] {
  // Count quantity+unit patterns to confirm this is an ingredient blob
  const UNIT_PATTERN = /[\d½¼¾⅓⅔][\d/.½¼¾⅓⅔-]*\s*(?:cups?|tbsps?|tsps?|tbs|tbl|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|gm|kg|ml|mls?|liters?|litres?|pints?|quarts?|fl\s*oz|pinch(?:es)?|dash(?:es)?|handfuls?|cloves?|bunch(?:es)?|sprigs?|stalks?|cans?|heads?|packages?|pkg|sticks?|pieces?|pcs?|slices?|bags?|bottles?|jars?|boxes?|drops?)\b/gi
  const unitMatches = text.match(UNIT_PATTERN)
  if (!unitMatches || unitMatches.length < 3) return [text]

  // Stage 1: Split at quantity + unit boundaries
  let result = text
    // Break before quantity + unit (main ingredient boundaries)
    .replace(
      /(\s)([\d½¼¾⅓⅔][\d/.½¼¾⅓⅔-]*\s*(?:cups?|tbsps?|tsps?|tbs|tbl|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|gm|kg|ml|mls?|liters?|litres?|pints?|quarts?|fl\s*oz|pinch(?:es)?|dash(?:es)?|handfuls?|cloves?|bunch(?:es)?|sprigs?|stalks?|cans?|heads?|packages?|pkg|sticks?|pieces?|pcs?|slices?|bags?|bottles?|jars?|boxes?|drops?)\b)/gi,
      '\n$2'
    )
    // Break before fractions without explicit units: "1/2 yellow onion"
    .replace(/(\s)(\d+\/\d+\s+[a-z])/gi, '\n$2')
    // Break before standalone numbers (not temps/times): "2 eggs", "3 tomatoes"
    .replace(/(\s)(\d+[-\d]*\s+[a-z])/gi, (match, space, rest) => {
      if (/^\d+[-\d]*\s*(degrees?|°[FCfc]?|minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/i.test(rest)) return match
      return '\n' + rest
    })

  // Stage 2: Split remaining long lines at qualifier boundaries,
  // but only lines that don't already start with a quantity (to avoid
  // splitting "1/2 cup pesto, to taste" into two pieces).
  let lines = result.split('\n').map(s => s.trim()).filter(s => s.length > 0)
  lines = lines.flatMap(line => {
    if (/^[\d½¼¾⅓⅔]/.test(line)) return [line]  // Already has quantity prefix
    const parts = line.replace(
      /(\w)\s+(\S+(?:\s+and\s+\S+)?[,\s]+(?:to\s+taste|(?:to|for)\s+garnish(?:ing)?|as\s+needed))/gi,
      '$1\n$2'
    ).split('\n').map(s => s.trim()).filter(s => s.length > 0)
    return parts.length > 1 ? parts : [line]
  })

  return lines
}

/**
 * Parse plain text into recipe components (title, ingredients, steps).
 * First non-empty line becomes the title. Lines are assigned to sections
 * based on explicit headers (Ingredients:/Instructions:) or auto-detected
 * by format (bullets → ingredients, numbered → steps).
 *
 * Long blob lines containing multiple ingredient patterns (common in
 * social media captions) are automatically split at quantity+unit
 * boundaries before parsing.
 */
export function parseTextRecipe(text: string): ParsedTextRecipe {
  if (text.includes('* Exported from MasterCook *')) {
    return parseMasterCookRecipe(text)
  }

  let lines = text.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { title: '', ingredientLines: [], stepLines: [] }

  // Pre-process: split long blob lines at ingredient boundaries.
  // Social media captions often dump all ingredients on one line.
  lines = lines.flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length > 80) {
      const parts = splitAtIngredientBoundaries(trimmed)
      if (parts.length > 1) return parts
    }
    return [line]
  })

  // If the first line is a section header (e.g. "Ingredients"), don't consume it
  // as the title — start parsing from line 0 so the header is detected properly.
  const firstLower = lines[0].toLowerCase().trim()
  const firstIsHeader = /^(=\s*)?(ingredients|grocery\s*list|instructions|steps|directions|method)\b/i.test(firstLower)

  let title: string
  let startIndex: number

  if (firstIsHeader) {
    title = 'Pasted Recipe'
    startIndex = 0
  } else {
    // First line is the title — strip leading symbols, list markers, prefixes, etc.
    title = lines[0]
      .replace(/^[<\u00ae=\-[\]0-9.]+\s*/, '')
      .replace(/^Title:\s*/i, '')
      .trim()
    startIndex = 1
  }

  const ingredientLines: string[] = []
  const stepLines: string[] = []

  let section: 'unknown' | 'ingredients' | 'steps' = 'unknown'

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    const lower = line.toLowerCase().trim()

    // Detect section headers
    if (/^(=\s*)?(ingredients|grocery\s*list)\b/i.test(lower) || lower === '= ingredients:') {
      section = 'ingredients'
      continue
    }
    if (/^(instructions|steps|directions|method)\b/i.test(lower)) {
      section = 'steps'
      continue
    }

    // Skip UI artifacts (buttons, category labels, etc.)
    if (/^[\u00ae<>[\]]+/.test(line.trim()) || /^(DO category|Addo List|Plan Meal)/i.test(lower)) {
      continue
    }

    // Clean leading markers (-, *, numbers with dots)
    const cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+\.\s*/, '').trim()
    if (!cleaned) continue

    const isNumbered = /^\d+\.\s/.test(line.trim())

    if (section === 'ingredients') {
      ingredientLines.push(cleaned)
    } else if (section === 'steps') {
      if (isNumbered) {
        // Numbered steps are explicitly structured — trust them
        stepLines.push(cleaned)
      } else {
        // Paragraph text — split into sentences, keep only cooking steps
        splitSentences(cleaned).filter(s => COOKING_VERBS.test(s)).forEach(s => stepLines.push(s))
      }
    } else {
      // Before any section header — try to detect by format
      if (/^[-*\u2022]\s/.test(line.trim()) || isLikelyIngredient(cleaned)) {
        ingredientLines.push(cleaned)
      } else if (/^\d+\.\s/.test(line.trim())) {
        stepLines.push(cleaned)
      } else if (hasCookingVerbs(cleaned)) {
        splitSentences(cleaned).filter(s => COOKING_VERBS.test(s)).forEach(s => stepLines.push(s))
      }
    }
  }

  return { title, ingredientLines, stepLines }
}

/** Split a long line into individual sentences on period boundaries */
function splitSentences(text: string): string[] {
  // Split on period followed by a space and uppercase letter (sentence boundary)
  // Avoid splitting on abbreviations like "oz.", "tbsp.", "350°F.", etc.
  const sentences = text.split(/\.(?:\s+)(?=[A-Z])/)
    .map(s => s.trim().replace(/\.$/, '').trim())
    .filter(s => s.length > 0)
  return sentences.length > 0 ? sentences : [text]
}

/** Detect lines that read like cooking instructions based on action verbs */
const COOKING_VERBS = /\b(cook|bake|roast|grill|saut[eé]|fry|simmer|boil|steam|broil|braise|brown|stir|mix|combine|whisk|fold|blend|chop|dice|slice|mince|peel|drain|heat|preheat|melt|pour|add|toss|season|marinate|spread|serve|refrigerat|chill|freeze|let\s+sit|set\s+aside|bring\s+to|stir\s+in|fold\s+in|top\s+with|remove\s+from|place\s+in|transfer|arrange)\b/i

function hasCookingVerbs(line: string): boolean {
  // Must be long enough to be an instruction (not just "serve" as a noun)
  // and contain at least one cooking action verb
  return line.length > 20 && COOKING_VERBS.test(line)
}
