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

  // Skip metadata lines until we hit the dashed ingredient separator
  let ingredientStart = -1
  for (; cursor < lines.length; cursor++) {
    const trimmed = lines[cursor].trim()
    if (/^-{4,}/.test(trimmed)) {
      ingredientStart = cursor + 1
      cursor = ingredientStart
      break
    }
  }

  if (ingredientStart === -1) return { title, ingredientLines: [], stepLines: [] }

  // Parse ingredient lines until a blank line gap (signals end of ingredients)
  const ingredientLines: string[] = []
  for (; cursor < lines.length; cursor++) {
    const trimmed = lines[cursor].trim()
    if (!trimmed) break // blank line ends ingredient block
    if (isSkipLine(trimmed)) continue

    const ingredient = parseIngredientLine(trimmed)
    if (ingredient) ingredientLines.push(ingredient)
  }

  // Steps: free-form paragraphs after the blank line, before nutrition/divider
  const stepLines: string[] = []
  for (; cursor < lines.length; cursor++) {
    const trimmed = lines[cursor].trim()
    if (!trimmed) continue
    if (isEndMarker(trimmed)) break
    if (isSkipLine(trimmed)) continue
    stepLines.push(trimmed)
  }

  return { title, ingredientLines, stepLines }
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
    /^-{4,}\s+-{4,}/.test(line) ||
    /^Nutr\.\s*Assoc/i.test(line) ||
    /^Exchanges\s*:/i.test(line)
  )
}

/** Markers that signal end of recipe steps */
function isEndMarker(line: string): boolean {
  return (
    /^-\s+-\s+-\s+-/.test(line) || // - - - - divider
    /^Per Serving/i.test(line) ||
    /^Nutr\.\s*Assoc/i.test(line) ||
    /^Exchanges\s*:/i.test(line)
  )
}

/** Parse a tabular MasterCook ingredient line into a readable string */
function parseIngredientLine(line: string): string | null {
  // MasterCook format: columns are amount, measure, ingredient (separated by whitespace)
  // The `--` in the ingredient field means ", " (prep method separator)
  const trimmed = line.trim()
  if (!trimmed || /^-+$/.test(trimmed)) return null

  // Replace ` -- ` with `, ` for prep methods
  const cleaned = trimmed
    .replace(/\s+/g, ' ')
    .replace(/\s*--\s*/g, ', ')

  return cleaned || null
}
