import type { GroceryItem } from './GroceryItem.ts'
import type { ManualGroceryItem } from './ManualGroceryItem.ts'

export interface SelectedRecipe {
  recipeId: string
  servingOverride: number | null
}

export interface GroceryList {
  id: string
  name: string
  selectedRecipes: SelectedRecipe[]
  items: GroceryItem[]
  manualItems: ManualGroceryItem[]
  createdAt: string
  updatedAt: string
}
