import { parseMasterCookRecipe } from './parseMasterCookRecipe.ts'

export interface ParsedTextRecipe {
  title: string
  ingredientLines: string[]
  stepLines: string[]
}

/**
 * Parse plain text into recipe components (title, ingredients, steps).
 * First non-empty line becomes the title. Lines are assigned to sections
 * based on explicit headers (Ingredients:/Instructions:) or auto-detected
 * by format (bullets → ingredients, numbered → steps).
 */
export function parseTextRecipe(text: string): ParsedTextRecipe {
  if (text.includes('* Exported from MasterCook *')) {
    return parseMasterCookRecipe(text)
  }

  let lines = text.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { title: '', ingredientLines: [], stepLines: [] }

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
      if (/^[-*\u2022]\s/.test(line.trim()) || /^\d+[a-z]*\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|lbs?|g|kg|ml)\b/i.test(cleaned)) {
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
