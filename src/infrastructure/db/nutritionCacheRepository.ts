import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'
import { db } from './database.ts'

export async function getCachedNutrition(recipeId: string): Promise<RecipeNutrition | null> {
  const entry = await db.nutritionCache.get(recipeId)
  return entry?.nutrition ?? null
}

export async function setCachedNutrition(recipeId: string, nutrition: RecipeNutrition): Promise<void> {
  await db.nutritionCache.put({ recipeId, nutrition })
}

export async function clearCachedNutrition(recipeId: string): Promise<void> {
  await db.nutritionCache.delete(recipeId)
}

export async function getCachedNutritionBulk(recipeIds: string[]): Promise<Map<string, RecipeNutrition>> {
  const entries = await db.nutritionCache.where('recipeId').anyOf(recipeIds).toArray()
  return new Map(entries.map((e) => [e.recipeId, e.nutrition]))
}
