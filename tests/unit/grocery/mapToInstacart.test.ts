import { describe, expect, it } from 'vitest'
import {
  mapUnitToInstacart,
  mapGroceryItemToLineItem,
  mapManualItemToLineItem,
  mapRecipeToInstacart,
  mapGroceryListToInstacart,
} from '@application/grocery/mapToInstacart.ts'
import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

describe('mapUnitToInstacart', () => {
  it('returns exact Instacart unit when already valid', () => {
    expect(mapUnitToInstacart('cup')).toBe('cup')
    expect(mapUnitToInstacart('tablespoon')).toBe('tablespoon')
    expect(mapUnitToInstacart('pound')).toBe('pound')
    expect(mapUnitToInstacart('each')).toBe('each')
  })

  it('maps common aliases to Instacart units', () => {
    expect(mapUnitToInstacart('cups')).toBe('cup')
    expect(mapUnitToInstacart('tbsp')).toBe('tablespoon')
    expect(mapUnitToInstacart('tsp')).toBe('teaspoon')
    expect(mapUnitToInstacart('lbs')).toBe('pound')
    expect(mapUnitToInstacart('oz')).toBe('ounce')
    expect(mapUnitToInstacart('ml')).toBe('milliliter')
    expect(mapUnitToInstacart('g')).toBe('gram')
    expect(mapUnitToInstacart('kg')).toBe('kilogram')
    expect(mapUnitToInstacart('fl oz')).toBe('fluid_ounce')
  })

  it('returns "each" for null or unknown units', () => {
    expect(mapUnitToInstacart(null)).toBe('each')
    expect(mapUnitToInstacart('handful')).toBe('each')
    expect(mapUnitToInstacart('dollop')).toBe('each')
  })

  it('is case-insensitive', () => {
    expect(mapUnitToInstacart('Cup')).toBe('cup')
    expect(mapUnitToInstacart('TBSP')).toBe('tablespoon')
    expect(mapUnitToInstacart('Oz')).toBe('ounce')
  })

  it('maps food-specific units to each', () => {
    expect(mapUnitToInstacart('clove')).toBe('each')
    expect(mapUnitToInstacart('cloves')).toBe('each')
    expect(mapUnitToInstacart('sprig')).toBe('each')
    expect(mapUnitToInstacart('slice')).toBe('each')
  })
})

describe('mapGroceryItemToLineItem', () => {
  it('maps a grocery item with quantity and unit', () => {
    const item: GroceryItem = {
      id: '1', ingredient: 'flour', displayName: 'All-Purpose Flour',
      qty: 2, unit: 'cups', category: 'pantry', checked: false,
      sourceRecipes: [], notes: null, optional: false,
    }
    const result = mapGroceryItemToLineItem(item)
    expect(result).toEqual({
      name: 'flour',
      display_text: 'All-Purpose Flour',
      measurements: [{ quantity: 2, unit: 'cup' }],
    })
  })

  it('uses quantity=1, unit=each for items without qty', () => {
    const item: GroceryItem = {
      id: '2', ingredient: 'garlic', displayName: 'Garlic',
      qty: null, unit: null, category: 'produce', checked: false,
      sourceRecipes: [], notes: null, optional: false,
    }
    const result = mapGroceryItemToLineItem(item)
    expect(result).toEqual({
      name: 'garlic',
      display_text: 'Garlic',
      quantity: 1,
      unit: 'each',
    })
  })
})

describe('mapManualItemToLineItem', () => {
  it('maps a manual item with quantity 1 and unit each', () => {
    const item: ManualGroceryItem = { id: 'm1', name: 'Paper towels', checked: false }
    const result = mapManualItemToLineItem(item)
    expect(result).toEqual({
      name: 'Paper towels',
      display_text: 'Paper towels',
      quantity: 1,
      unit: 'each',
    })
  })
})

describe('mapRecipeToInstacart', () => {
  const baseRecipe: Recipe = {
    id: 'r1', title: 'Test Recipe', sourceUrl: 'https://example.com/recipe',
    sourceDomain: 'example.com', author: 'Test Author', description: null,
    imageUrl: 'https://example.com/image.jpg', servings: 4, servingsText: '4 servings',
    prepTimeMinutes: 15, cookTimeMinutes: 30, totalTimeMinutes: 45,
    ingredients: [
      { id: 'i1', raw: '2 cups flour', qty: 2, unit: 'cups', unitCanonical: 'cup', ingredient: 'flour', prep: null, notes: null, category: 'pantry', optional: false },
      { id: 'i2', raw: '3 eggs', qty: 3, unit: null, unitCanonical: null, ingredient: 'eggs', prep: null, notes: null, category: 'dairy', optional: false },
    ],
    steps: [
      { id: 's1', order: 1, text: 'Mix flour and eggs.', timerSeconds: null, ingredientRefs: [] },
      { id: 's2', order: 2, text: 'Bake at 350F.', timerSeconds: null, ingredientRefs: [] },
    ],
    nutrition: null, keywords: [], cuisines: [], categories: [], tags: [],
    notes: null, favorite: false, extractedAt: '2026-01-01',
    extractionLayer: 'json-ld', parserVersion: '1.0', schemaVersion: 1,
  }

  it('maps a full recipe to Instacart format', () => {
    const result = mapRecipeToInstacart(baseRecipe)
    expect(result.title).toBe('Test Recipe')
    expect(result.image_url).toBe('https://example.com/image.jpg')
    expect(result.author).toBe('Test Author')
    expect(result.servings).toBe('4')
    expect(result.cooking_time).toBe('45 minutes')
    expect(result.instructions).toEqual(['Mix flour and eggs.', 'Bake at 350F.'])
    expect(result.ingredients).toHaveLength(2)
    expect(result.ingredients[0]).toEqual({
      name: 'flour',
      display_text: '2 cups flour',
      measurements: [{ quantity: 2, unit: 'cup' }],
    })
    expect(result.ingredients[1]).toEqual({
      name: 'eggs',
      display_text: '3 eggs',
      measurements: [{ quantity: 3, unit: 'each' }],
    })
  })

  it('omits optional fields when not present', () => {
    const minimal: Recipe = {
      ...baseRecipe,
      imageUrl: null, author: null, servings: null,
      totalTimeMinutes: null, cookTimeMinutes: null, steps: [],
    }
    const result = mapRecipeToInstacart(minimal)
    expect(result.image_url).toBeUndefined()
    expect(result.author).toBeUndefined()
    expect(result.servings).toBeUndefined()
    expect(result.cooking_time).toBeUndefined()
    expect(result.instructions).toBeUndefined()
  })

  it('handles range quantities by averaging', () => {
    const rangeRecipe: Recipe = {
      ...baseRecipe,
      ingredients: [
        { id: 'i1', raw: '2-3 cups flour', qty: { min: 2, max: 3 }, unit: 'cups', unitCanonical: 'cup', ingredient: 'flour', prep: null, notes: null, category: 'pantry', optional: false },
      ],
    }
    const result = mapRecipeToInstacart(rangeRecipe)
    expect(result.ingredients[0].measurements).toEqual([{ quantity: 2.5, unit: 'cup' }])
  })
})

describe('mapGroceryListToInstacart', () => {
  it('combines grocery items and manual items into line_items', () => {
    const items: GroceryItem[] = [
      { id: '1', ingredient: 'milk', displayName: 'Whole Milk', qty: 1, unit: 'gallon', category: 'dairy', checked: false, sourceRecipes: [], notes: null, optional: false },
    ]
    const manualItems: ManualGroceryItem[] = [
      { id: 'm1', name: 'Bread', checked: false },
    ]
    const result = mapGroceryListToInstacart('My List', items, manualItems)
    expect(result.title).toBe('My List')
    expect(result.line_items).toHaveLength(2)
    expect(result.line_items[0].name).toBe('milk')
    expect(result.line_items[1].name).toBe('Bread')
  })
})
