import { useLiveQuery } from 'dexie-react-hooks'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { db } from '@infrastructure/db/database.ts'
import {
  saveRecipe,
  deleteRecipe,
  updateRecipeTags,
  updateRecipeNotes,
  updateRecipeFavorite,
} from '@infrastructure/db/recipeRepository.ts'
import { incrementSaveCount } from '@infrastructure/backup/backupNudge.ts'

export function useSavedRecipes() {
  const recipes = useLiveQuery(
    () => db.recipes.orderBy('savedAt').reverse().toArray(),
    [],
  )

  const save = async (recipe: Recipe): Promise<SavedRecipe> => {
    const saved = await saveRecipe(recipe)
    incrementSaveCount()
    return saved
  }

  return {
    recipes: recipes ?? [],
    isLoading: recipes === undefined,
    save,
    remove: (id: string): Promise<void> => deleteRecipe(id),
    toggleFavorite: (id: string, current: boolean) => updateRecipeFavorite(id, !current),
    updateNotes: (id: string, notes: string | null) => updateRecipeNotes(id, notes),
    updateTags: (id: string, tags: string[]) => updateRecipeTags(id, tags),
  }
}

export function useIsRecipeSaved(sourceUrl: string | undefined) {
  const saved = useLiveQuery(
    () => {
      if (!sourceUrl) return false
      return db.recipes.where('sourceUrl').equals(sourceUrl).count().then((c) => c > 0)
    },
    [sourceUrl],
  )

  return saved ?? false
}

export function useSavedRecipe(id: string | null) {
  const recipe = useLiveQuery(
    () => {
      if (!id) return undefined
      return db.recipes.get(id)
    },
    [id],
  )

  return recipe ?? null
}
