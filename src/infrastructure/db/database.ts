import Dexie, { type Table } from 'dexie'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

export class MiseDB extends Dexie {
  recipes!: Table<SavedRecipe, string>

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
  }
}

export const db = new MiseDB()
