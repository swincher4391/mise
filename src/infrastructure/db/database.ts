import Dexie, { type Table } from 'dexie'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { GroceryList } from '@domain/models/GroceryList.ts'
import type { MealPlan } from '@domain/models/MealPlan.ts'

export interface ExtractionCacheEntry {
  canonicalUrl: string
  extractedAt: number
  transcript: string | null
  ocrText: string | null
}

export class MiseDB extends Dexie {
  recipes!: Table<SavedRecipe, string>
  groceryLists!: Table<GroceryList, string>
  mealPlans!: Table<MealPlan, string>
  extractionCache!: Table<ExtractionCacheEntry, string>

  constructor() {
    super('MiseDB')

    this.version(1).stores({
      recipes: 'id, sourceUrl, title, savedAt',
    })

    this.version(2).stores({
      recipes: 'id, sourceUrl, title, savedAt, *tags, favorite',
    }).upgrade((tx) => {
      return tx.table('recipes').toCollection().modify((recipe) => {
        if (!recipe.tags) recipe.tags = []
        if (recipe.notes === undefined) recipe.notes = null
        if (recipe.favorite === undefined) recipe.favorite = false
      })
    })

    this.version(3).stores({
      recipes: 'id, sourceUrl, title, savedAt, *tags, favorite',
      groceryLists: 'id, name, createdAt, updatedAt',
    })

    this.version(4).stores({
      recipes: 'id, sourceUrl, title, savedAt, *tags, favorite',
      groceryLists: 'id, name, createdAt, updatedAt',
      mealPlans: 'id, weekStart, updatedAt',
    })

    this.version(5).stores({
      recipes: 'id, sourceUrl, title, savedAt, *tags, favorite',
      groceryLists: 'id, name, createdAt, updatedAt',
      mealPlans: 'id, weekStart, updatedAt',
      extractionCache: 'canonicalUrl, extractedAt',
    })
  }
}

export const db = new MiseDB()
