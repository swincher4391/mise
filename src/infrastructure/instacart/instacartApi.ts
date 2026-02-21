import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { mapGroceryListToInstacart, mapRecipeToInstacart } from '@application/grocery/mapToInstacart.ts'

export interface InstacartResult {
  url: string
}

export async function createShoppingList(
  title: string,
  items: GroceryItem[],
  manualItems: ManualGroceryItem[],
): Promise<InstacartResult> {
  const body = mapGroceryListToInstacart(title, items, manualItems)

  const response = await fetch('/api/grocery/instacart-shopping-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error ?? `Instacart API error (${response.status})`)
  }

  return response.json()
}

export async function createRecipePage(
  recipe: Recipe | SavedRecipe,
): Promise<InstacartResult> {
  const body = mapRecipeToInstacart(recipe)

  const response = await fetch('/api/grocery/instacart-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error ?? `Instacart API error (${response.status})`)
  }

  return response.json()
}
