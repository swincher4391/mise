import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { buildShareUrl } from './compressRecipe.ts'

/**
 * Format a recipe as Reddit markdown and copy to clipboard.
 * Includes a Mise share link at the bottom.
 */
export async function copyRedditFormat(recipe: Recipe | SavedRecipe): Promise<boolean> {
  const shareUrl = await buildShareUrl(recipe)
  const text = formatRecipeAsReddit(recipe, shareUrl)

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function formatRecipeAsReddit(recipe: Recipe | SavedRecipe, shareUrl: string): string {
  const lines: string[] = []

  lines.push(`**${recipe.title}**`)
  lines.push('')

  // Metadata line
  const meta: string[] = []
  if (recipe.servings) meta.push(`Serves ${recipe.servings}`)
  if (recipe.prepTimeMinutes) meta.push(`Prep: ${formatMinutes(recipe.prepTimeMinutes)}`)
  if (recipe.cookTimeMinutes) meta.push(`Cook: ${formatMinutes(recipe.cookTimeMinutes)}`)
  if (recipe.totalTimeMinutes && !recipe.prepTimeMinutes && !recipe.cookTimeMinutes) {
    meta.push(`Total: ${formatMinutes(recipe.totalTimeMinutes)}`)
  }
  if (meta.length > 0) {
    lines.push(meta.join(' | '))
    lines.push('')
  }

  // Ingredients
  if (recipe.ingredients && recipe.ingredients.length > 0) {
    lines.push('**Ingredients**')
    lines.push('')
    for (const ing of recipe.ingredients) {
      lines.push(`* ${ing.raw}`)
    }
    lines.push('')
  }

  // Steps
  if (recipe.steps && recipe.steps.length > 0) {
    lines.push('**Instructions**')
    lines.push('')
    for (let i = 0; i < recipe.steps.length; i++) {
      lines.push(`${i + 1}. ${recipe.steps[i].text}`)
    }
    lines.push('')
  }

  // Mise link
  lines.push('---')
  lines.push('')
  lines.push(`[View with cooking mode in Mise](${shareUrl})`)

  return lines.join('\n')
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
