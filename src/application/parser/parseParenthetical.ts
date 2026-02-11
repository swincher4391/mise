export interface ParentheticalResult {
  text: string
  notes: string[]
}

/**
 * Extract parenthetical expressions from ingredient text.
 * Stores contents as notes.
 */
export function parseParenthetical(text: string): ParentheticalResult {
  const notes: string[] = []
  let cleaned = text

  // Match all (...) patterns
  const matches = text.matchAll(/\(([^)]+)\)/g)

  for (const match of matches) {
    const content = match[1].trim()
    notes.push(content)
    cleaned = cleaned.replace(match[0], ' ')
  }

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  return { text: cleaned, notes }
}
