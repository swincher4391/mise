/**
 * Maps recipe categories, keywords, and title to preset tags.
 * Uses case-insensitive matching against common recipe taxonomy terms.
 */

const TAG_RULES: Record<string, string[]> = {
  'breakfast': ['breakfast', 'brunch', 'morning'],
  'lunch/dinner': ['dinner', 'lunch', 'main course', 'main dish', 'entree', 'entrée', 'supper', 'main'],
  'dessert': ['dessert', 'desserts', 'baking', 'cake', 'cookies', 'pastry', 'sweet'],
  'snacks': ['snack', 'snacks', 'appetizer', 'appetizers', 'starter', 'starters', 'side dish', 'side'],
  'crockpot': ['slow cooker', 'crock pot', 'crockpot', 'crock-pot'],
  'soups': ['soup', 'soups', 'stew', 'stews', 'chili', 'bisque', 'chowder'],
  'kid-friendly': ['kid-friendly', 'kid friendly', 'kids', 'family', 'family-friendly', 'family friendly', 'child-friendly'],
}

export function autoTagRecipe(categories: string[], keywords: string[], title: string): string[] {
  const tags = new Set<string>()
  const searchTerms = [...categories, ...keywords, title].map((s) => s.toLowerCase())

  for (const [tag, matchers] of Object.entries(TAG_RULES)) {
    for (const term of searchTerms) {
      if (matchers.some((m) => term.includes(m))) {
        tags.add(tag)
        break
      }
    }
  }

  return Array.from(tags)
}
