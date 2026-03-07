import type { ParsedTextRecipe } from './parseTextRecipe.ts'

/**
 * Parse a MasterCook (.mxp) export into recipe components.
 * Expects text containing `* Exported from MasterCook *`.
 */
export function parseMasterCookRecipe(text: string): ParsedTextRecipe {
  const lines = text.split('\n')

  // Find the marker line
  const markerIdx = lines.findIndex((l) => l.includes('* Exported from MasterCook *'))
  if (markerIdx === -1) return { title: '', ingredientLines: [], stepLines: [] }

  // Title: first non-blank line after marker
  let title = ''
  let cursor = markerIdx + 1
  for (; cursor < lines.length; cursor++) {
    const trimmed = lines[cursor].trim()
    if (trimmed) {
      title = trimmed
      cursor++
      break
    }
  }

  // Collect all remaining non-blank, non-skip lines
  const contentLines: string[] = []
  for (; cursor < lines.length; cursor++) {
    const trimmed = lines[cursor].trim()
    if (isEndMarker(trimmed)) break
    if (!trimmed || isSkipLine(trimmed)) continue
    contentLines.push(trimmed)
  }

  // Split content into ingredients vs steps.
  // Ingredients are short tabular lines; steps are long free-form paragraphs.
  // The transition point is the first line that looks like a sentence/paragraph
  // (long enough, starts with a capital letter, contains cooking verbs or is >80 chars).
  const ingredientLines: string[] = []
  const stepLines: string[] = []
  let foundSteps = false

  for (const line of contentLines) {
    if (!foundSteps && isIngredientLine(line)) {
      const parsed = parseIngredientLine(line)
      if (parsed) ingredientLines.push(parsed)
    } else {
      foundSteps = true
      if (!isAttribution(line)) {
        // Split paragraphs into sentences, keep only those with cooking verbs
        splitSentences(line)
          .filter(s => COOKING_VERBS.test(s))
          .forEach(s => stepLines.push(s))
      }
    }
  }

  return { title, ingredientLines, stepLines }
}

/** Detect lines that look like MasterCook tabular ingredients (short, no sentence structure) */
function isIngredientLine(line: string): boolean {
  // Ingredient lines are typically short and don't start with sentence-like structure
  // Step lines are long paragraphs (>80 chars) or start with cooking verbs
  if (line.length > 80) return false
  if (/^(pour|cook|bake|heat|preheat|mix|combine|stir|add|place|remove|bring|let|set|cut|slice|chop|drain|boil|simmer|melt|whisk|fold|blend|saut[eé]|fry|roast|grill|steam|broil|braise|brown|toss|season|marinate|spread|serve|refrigerat|chill|freeze|transfer|arrange|slip|peel)\b/i.test(line)) return false
  return true
}

/** Lines to skip entirely */
function isSkipLine(line: string): boolean {
  return (
    line.includes('* Exported from MasterCook *') ||
    /^Recipe By\s*:/i.test(line) ||
    /^Categories\s*:/i.test(line) ||
    /^Serving Size\s*:/i.test(line) ||
    /^Preparation Time\s*:/i.test(line) ||
    /^Amount\s+Measure\s+Ingredient/i.test(line) ||
    /^-{4,}/.test(line) ||
    /^Nutr\.\s*Assoc/i.test(line) ||
    /^Exchanges\s*:/i.test(line)
  )
}

/** Markers that signal end of recipe content */
function isEndMarker(line: string): boolean {
  return (
    /^-\s+-\s+-\s+-/.test(line) || // - - - - divider
    /^Per Serving/i.test(line) ||
    /^Nutr\.\s*Assoc/i.test(line) ||
    /^Exchanges\s*:/i.test(line)
  )
}

/** Detect source attribution lines like "The Woman's World Cook Book, 1961" */
function isAttribution(line: string): boolean {
  return (
    (/,?\s*(\d{4}|date\s+unknown)\s*$/.test(line) && line.length < 80) ||
    /^(recipe\s+(from|by|source)|source\s*:|from\s+the\s+kitchen\s+of)/i.test(line) ||
    /\bbook\s+of\s+recipes\b/i.test(line)
  )
}

const COOKING_VERBS = /\b(cook|bake|roast|grill|saut[eé]|fry|simmer|boil|steam|broil|braise|brown|stir|mix|combine|whisk|fold|blend|chop|dice|slice|mince|peel|drain|heat|preheat|melt|pour|add|toss|season|marinate|spread|serve|refrigerat|chill|freeze|let\s+sit|set\s+aside|bring\s+to|stir\s+in|fold\s+in|top\s+with|remove\s+from|place\s+in|transfer|arrange)\b/i

/** Split a paragraph into individual sentences on period boundaries */
function splitSentences(text: string): string[] {
  const sentences = text.split(/\.(?:\s+)(?=[A-Z])/)
    .map(s => s.trim().replace(/\.$/, '').trim())
    .filter(s => s.length > 0)
  return sentences.length > 0 ? sentences : [text]
}

/** Parse a tabular MasterCook ingredient line into a readable string */
function parseIngredientLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || /^-+$/.test(trimmed)) return null

  // Normalize whitespace, then replace `--` with `, ` for prep methods
  const cleaned = trimmed
    .replace(/\s+/g, ' ')
    .replace(/\s*\u2014\s*/g, ', ')   // em-dash
    .replace(/\s*\u2013\s*/g, ', ')   // en-dash
    .replace(/\s*--\s*/g, ', ')

  return cleaned || null
}
