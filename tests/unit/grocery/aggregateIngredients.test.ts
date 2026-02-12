import { describe, it, expect } from 'vitest'
import { aggregateIngredients } from '@application/grocery/aggregateIngredients.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { Ingredient } from '@domain/models/Ingredient.ts'
import type { SelectedRecipe } from '@domain/models/GroceryList.ts'

function makeIngredient(overrides: Partial<Ingredient>): Ingredient {
  return {
    id: `ing-${Math.random().toString(36).slice(2, 8)}`,
    raw: '',
    qty: null,
    unit: null,
    unitCanonical: null,
    ingredient: 'test ingredient',
    prep: null,
    notes: null,
    category: null,
    optional: false,
    ...overrides,
  }
}

function makeRecipe(overrides: Partial<SavedRecipe> & { ingredients: Ingredient[] }): SavedRecipe {
  return {
    id: `recipe-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Recipe',
    sourceUrl: 'https://example.com',
    sourceDomain: 'example.com',
    author: null,
    description: null,
    imageUrl: null,
    servings: 4,
    servingsText: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    steps: [],
    nutrition: null,
    keywords: [],
    cuisines: [],
    categories: [],
    tags: [],
    notes: null,
    favorite: false,
    extractedAt: new Date().toISOString(),
    extractionLayer: 'json-ld',
    parserVersion: '1.0',
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as SavedRecipe
}

describe('aggregateIngredients', () => {
  it('sums same ingredient with same unit system', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'onion' }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 2, unitCanonical: 'cup', ingredient: 'onions' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const onionItem = result.find((i) => i.ingredient === 'onion')

    expect(onionItem).toBeDefined()
    expect(onionItem!.qty).toBe(3)
    expect(onionItem!.unit).toBe('cup')
    expect(onionItem!.sourceRecipes).toHaveLength(2)
  })

  it('keeps separate lines for different unit systems (volume vs weight)', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'flour' }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 200, unitCanonical: 'gram', ingredient: 'flour' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const flourItems = result.filter((i) => i.ingredient === 'flour')

    expect(flourItems).toHaveLength(2)
  })

  it('handles null-qty ingredients (to taste)', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: null, unitCanonical: null, ingredient: 'salt' }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: null, unitCanonical: null, ingredient: 'salt' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const saltItems = result.filter((i) => i.ingredient === 'salt')

    expect(saltItems).toHaveLength(1)
    expect(saltItems[0].qty).toBeNull()
    expect(saltItems[0].sourceRecipes).toHaveLength(2)
  })

  it('uses max for range quantities', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: { min: 3, max: 4 }, unitCanonical: 'clove', ingredient: 'garlic' }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 2, unitCanonical: 'clove', ingredient: 'garlic' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const garlicItem = result.find((i) => i.ingredient === 'garlic')

    expect(garlicItem).toBeDefined()
    expect(garlicItem!.qty).toBe(6) // max(4) + 2
    expect(garlicItem!.unit).toBe('clove')
  })

  it('marks optional only when ALL sources are optional', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'cilantro', optional: true }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'cilantro', optional: false }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const cilantro = result.find((i) => i.ingredient === 'cilantro')

    expect(cilantro!.optional).toBe(false)
  })

  it('scales with serving override', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 2, unitCanonical: 'cup', ingredient: 'rice' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: 8 }, // double
    ]

    const result = aggregateIngredients([r1], selected)
    const rice = result.find((i) => i.ingredient === 'rice')

    expect(rice).toBeDefined()
    expect(rice!.qty).toBe(4) // 2 cups * 2 = 4 cups
  })

  it('sorts by category then alphabetically', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'flour', category: 'pantry' }),
        makeIngredient({ qty: 2, unitCanonical: null, ingredient: 'onion', category: 'produce' }),
        makeIngredient({ qty: 1, unitCanonical: 'pound', ingredient: 'chicken breast', category: 'meat' }),
        makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'butter', category: 'dairy' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
    ]

    const result = aggregateIngredients([r1], selected)

    expect(result[0].category).toBe('produce')
    expect(result[1].category).toBe('meat')
    expect(result[2].category).toBe('dairy')
    expect(result[3].category).toBe('pantry')
  })

  it('handles recipe with null servings', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: null,
      ingredients: [
        makeIngredient({ qty: 2, unitCanonical: 'cup', ingredient: 'milk' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
    ]

    const result = aggregateIngredients([r1], selected)
    const milk = result.find((i) => i.ingredient === 'milk')

    expect(milk).toBeDefined()
    expect(milk!.qty).toBe(2)
  })

  it('converts volume to best display unit when aggregated', () => {
    const r1 = makeRecipe({
      id: 'r1',
      title: 'Recipe A',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 8, unitCanonical: 'tablespoon', ingredient: 'olive oil' }),
      ],
    })
    const r2 = makeRecipe({
      id: 'r2',
      title: 'Recipe B',
      servings: 4,
      ingredients: [
        makeIngredient({ qty: 8, unitCanonical: 'tablespoon', ingredient: 'olive oil' }),
      ],
    })

    const selected: SelectedRecipe[] = [
      { recipeId: 'r1', servingOverride: null },
      { recipeId: 'r2', servingOverride: null },
    ]

    const result = aggregateIngredients([r1, r2], selected)
    const oil = result.find((i) => i.ingredient === 'olive oil')

    expect(oil).toBeDefined()
    // 16 tbsp = 1 cup
    expect(oil!.qty).toBe(1)
    expect(oil!.unit).toBe('cup')
  })
})
