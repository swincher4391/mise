import type { Range } from './Ingredient.ts'

export interface RecipeSource {
  recipeId: string
  recipeTitle: string
  originalQty: number | Range | null
  originalUnit: string | null
}

export interface GroceryItem {
  id: string
  ingredient: string         // normalized name (aggregation key)
  displayName: string        // original casing
  qty: number | null         // aggregated quantity
  unit: string | null        // canonical unit after aggregation
  category: string | null    // produce, meat, dairy, pantry, spices, frozen, beverages
  checked: boolean
  sourceRecipes: RecipeSource[]
  notes: string | null
  optional: boolean          // true only if ALL sources were optional
}
