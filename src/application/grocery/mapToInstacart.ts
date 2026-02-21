import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { Ingredient } from '@domain/models/Ingredient.ts'

export interface InstacartLineItem {
  name: string
  display_text?: string
  measurements?: { quantity: number; unit: string }[]
  quantity?: number
  unit?: string
}

export interface InstacartRecipeRequest {
  title: string
  image_url?: string
  author?: string
  servings?: string
  cooking_time?: string
  instructions?: string[]
  ingredients: InstacartLineItem[]
}

export interface InstacartShoppingListRequest {
  title: string
  image_url?: string
  line_items: InstacartLineItem[]
}

const INSTACART_UNITS = new Set([
  'cup', 'fluid_ounce', 'gallon', 'milliliter', 'liter', 'pint', 'quart',
  'tablespoon', 'teaspoon', 'gram', 'kilogram', 'pound', 'ounce', 'each',
  'bunch', 'can', 'ear', 'ears', 'head', 'heads', 'large', 'medium',
  'small', 'package', 'packet',
])

const UNIT_ALIASES: Record<string, string> = {
  'cups': 'cup',
  'c': 'cup',
  'fl oz': 'fluid_ounce',
  'fluid ounce': 'fluid_ounce',
  'fluid ounces': 'fluid_ounce',
  'gal': 'gallon',
  'gallons': 'gallon',
  'ml': 'milliliter',
  'milliliters': 'milliliter',
  'l': 'liter',
  'liters': 'liter',
  'litres': 'liter',
  'pints': 'pint',
  'pt': 'pint',
  'quarts': 'quart',
  'qt': 'quart',
  'tbsp': 'tablespoon',
  'tablespoons': 'tablespoon',
  'tbs': 'tablespoon',
  'tsp': 'teaspoon',
  'teaspoons': 'teaspoon',
  'g': 'gram',
  'grams': 'gram',
  'kg': 'kilogram',
  'kilograms': 'kilogram',
  'lb': 'pound',
  'lbs': 'pound',
  'pounds': 'pound',
  'oz': 'ounce',
  'ounces': 'ounce',
  'bunches': 'bunch',
  'cans': 'can',
  'packages': 'package',
  'packets': 'packet',
  'pkg': 'package',
  'pkt': 'packet',
  'clove': 'each',
  'cloves': 'each',
  'slice': 'each',
  'slices': 'each',
  'piece': 'each',
  'pieces': 'each',
  'whole': 'each',
  'pinch': 'each',
  'dash': 'each',
  'sprig': 'each',
  'sprigs': 'each',
  'stalk': 'each',
  'stalks': 'each',
}

export function mapUnitToInstacart(unit: string | null): string {
  if (!unit) return 'each'
  const lower = unit.toLowerCase().trim()
  if (INSTACART_UNITS.has(lower)) return lower
  return UNIT_ALIASES[lower] ?? 'each'
}

export function mapGroceryItemToLineItem(item: GroceryItem): InstacartLineItem {
  const unit = mapUnitToInstacart(item.unit)
  const lineItem: InstacartLineItem = {
    name: item.ingredient,
    display_text: item.displayName,
  }

  if (item.qty != null && item.qty > 0) {
    lineItem.measurements = [{ quantity: item.qty, unit }]
  } else {
    lineItem.quantity = 1
    lineItem.unit = 'each'
  }

  return lineItem
}

export function mapManualItemToLineItem(item: ManualGroceryItem): InstacartLineItem {
  return {
    name: item.name,
    display_text: item.name,
    quantity: 1,
    unit: 'each',
  }
}

function mapIngredientToLineItem(ingredient: Ingredient): InstacartLineItem {
  const unit = mapUnitToInstacart(ingredient.unit)
  const lineItem: InstacartLineItem = {
    name: ingredient.ingredient,
    display_text: ingredient.raw,
  }

  const qty = typeof ingredient.qty === 'number'
    ? ingredient.qty
    : ingredient.qty
      ? (ingredient.qty.min + ingredient.qty.max) / 2
      : null

  if (qty != null && qty > 0) {
    lineItem.measurements = [{ quantity: qty, unit }]
  } else {
    lineItem.quantity = 1
    lineItem.unit = 'each'
  }

  return lineItem
}

function formatCookingTime(recipe: Recipe): string | undefined {
  if (recipe.totalTimeMinutes) return `${recipe.totalTimeMinutes} minutes`
  if (recipe.cookTimeMinutes) return `${recipe.cookTimeMinutes} minutes`
  return undefined
}

export function mapRecipeToInstacart(recipe: Recipe): InstacartRecipeRequest {
  const request: InstacartRecipeRequest = {
    title: recipe.title,
    ingredients: recipe.ingredients.map(mapIngredientToLineItem),
  }

  if (recipe.imageUrl) request.image_url = recipe.imageUrl
  if (recipe.author) request.author = recipe.author
  if (recipe.servings != null) request.servings = String(recipe.servings)

  const cookingTime = formatCookingTime(recipe)
  if (cookingTime) request.cooking_time = cookingTime

  if (recipe.steps.length > 0) {
    request.instructions = recipe.steps.map((s) => s.text)
  }

  return request
}

export function mapGroceryListToInstacart(
  title: string,
  items: GroceryItem[],
  manualItems: ManualGroceryItem[],
): InstacartShoppingListRequest {
  const lineItems = [
    ...items.map(mapGroceryItemToLineItem),
    ...manualItems.map(mapManualItemToLineItem),
  ]

  return {
    title,
    line_items: lineItems,
  }
}
