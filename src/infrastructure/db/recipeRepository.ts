import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { db } from './database.ts'

export async function saveRecipe(recipe: Recipe): Promise<SavedRecipe> {
  const now = new Date().toISOString()
  const existing = await db.recipes.where('sourceUrl').equals(recipe.sourceUrl).first()

  const saved: SavedRecipe = {
    ...recipe,
    tags: existing?.tags ?? recipe.tags ?? [],
    notes: existing?.notes ?? recipe.notes ?? null,
    favorite: existing?.favorite ?? recipe.favorite ?? false,
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
  }

  await db.recipes.put(saved)
  return saved
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
}

export async function getRecipeById(id: string): Promise<SavedRecipe | undefined> {
  return db.recipes.get(id)
}

export async function isRecipeSaved(sourceUrl: string): Promise<boolean> {
  const count = await db.recipes.where('sourceUrl').equals(sourceUrl).count()
  return count > 0
}

export async function updateRecipeTags(id: string, tags: string[]): Promise<void> {
  await db.recipes.update(id, { tags, updatedAt: new Date().toISOString() })
}

export async function updateRecipeNotes(id: string, notes: string | null): Promise<void> {
  await db.recipes.update(id, { notes, updatedAt: new Date().toISOString() })
}

export async function updateRecipeFavorite(id: string, favorite: boolean): Promise<void> {
  await db.recipes.update(id, { favorite, updatedAt: new Date().toISOString() })
}

export async function getAllRecipes(): Promise<SavedRecipe[]> {
  return db.recipes.orderBy('savedAt').reverse().toArray()
}
