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
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { title: '', ingredientLines: [], stepLines: [] }

  // First line is the title — strip leading symbols, list markers, etc.
  const title = lines[0].replace(/^[<\u00ae=\-[\]0-9.]+\s*/, '').trim()

  const ingredientLines: string[] = []
  const stepLines: string[] = []

  let section: 'unknown' | 'ingredients' | 'steps' = 'unknown'

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const lower = line.toLowerCase().trim()

    // Detect section headers
    if (/^(=\s*)?ingredients\s*:?$/i.test(lower) || lower === '= ingredients:') {
      section = 'ingredients'
      continue
    }
    if (/^(instructions|steps|directions|method)\s*:?$/i.test(lower)) {
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

    if (section === 'ingredients') {
      ingredientLines.push(cleaned)
    } else if (section === 'steps') {
      stepLines.push(cleaned)
    } else {
      // Before any section header — try to detect by format
      if (/^[-*\u2022]\s/.test(line.trim()) || /^\d+[a-z]*\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|lbs?|g|kg|ml)\b/i.test(cleaned)) {
        ingredientLines.push(cleaned)
      } else if (/^\d+\.\s/.test(line.trim())) {
        stepLines.push(cleaned)
      } else if (hasCookingVerbs(cleaned)) {
        stepLines.push(cleaned)
      }
    }
  }

  return { title, ingredientLines, stepLines }
}

/** Detect lines that read like cooking instructions based on action verbs */
const COOKING_VERBS = /\b(cook|bake|roast|grill|saut[eé]|fry|simmer|boil|steam|broil|braise|stir|mix|combine|whisk|fold|blend|chop|dice|slice|mince|peel|drain|heat|preheat|melt|pour|add|toss|season|marinate|spread|serve|refrigerat|chill|freeze|let\s+sit|set\s+aside|bring\s+to|stir\s+in|fold\s+in|top\s+with|remove\s+from|place\s+in|transfer|arrange)\b/i

function hasCookingVerbs(line: string): boolean {
  // Must be long enough to be an instruction (not just "serve" as a noun)
  // and contain at least one cooking action verb
  return line.length > 20 && COOKING_VERBS.test(line)
}
