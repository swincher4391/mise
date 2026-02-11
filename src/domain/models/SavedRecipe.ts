import type { Recipe } from './Recipe.ts'

export interface SavedRecipe extends Recipe {
  savedAt: string
  updatedAt: string
}
