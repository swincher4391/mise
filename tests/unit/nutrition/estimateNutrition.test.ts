import { describe, it, expect } from 'vitest'
import { lookupStaple, qtyToGrams, normalizeForLookup } from '../../../src/application/nutrition/estimateNutrition.ts'
import { estimateNutrition } from '../../../src/application/nutrition/estimateNutrition.ts'
import type { Recipe } from '../../../src/domain/models/Recipe.ts'
import type { Ingredient } from '../../../src/domain/models/Ingredient.ts'

function makeIngredient(overrides: Partial<Ingredient> & { ingredient: string; raw: string }): Ingredient {
  return {
    id: `ing_${Math.random().toString(36).slice(2)}`,
    qty: 1,
    unit: null,
    unitCanonical: null,
    prep: null,
    notes: null,
    category: null,
    optional: false,
    ...overrides,
  }
}

function makeRecipe(ingredients: Ingredient[], servings: number | null = 4): Recipe {
  return {
    id: `recipe_${Date.now()}`,
    title: 'Test Recipe',
    sourceUrl: '',
    sourceDomain: '',
    author: null,
    description: null,
    imageUrl: null,
    servings,
    servingsText: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    ingredients,
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
    parserVersion: '1.0.0',
    schemaVersion: 1,
  }
}

describe('Staples cache alias resolution', () => {
  it('resolves exact match', () => {
    const result = lookupStaple('chicken breast')
    expect(result).not.toBeNull()
    expect(result!.per100g.protein).toBeGreaterThan(20)
  })

  it('resolves plural form', () => {
    const result = lookupStaple('carrots')
    expect(result).not.toBeNull()
    expect(result!.per100g.calories).toBe(41)
  })

  it('resolves with prefix stripping (fresh)', () => {
    const result = lookupStaple('fresh basil')
    expect(result).not.toBeNull()
  })

  it('resolves with prefix stripping (dried)', () => {
    const result = lookupStaple('dried thyme')
    expect(result).not.toBeNull()
  })

  it('resolves with prefix stripping (boneless skinless)', () => {
    const result = lookupStaple('boneless skinless chicken breast')
    expect(result).not.toBeNull()
    expect(result!.per100g.protein).toBe(31)
  })

  it('resolves with parenthetical removal', () => {
    const result = lookupStaple('tomatoes (diced)')
    expect(result).not.toBeNull()
  })

  it('resolves with comma removal', () => {
    const result = lookupStaple('onion, diced')
    expect(result).not.toBeNull()
  })

  it('resolves sesame seeds (FDC 2707586)', () => {
    const result = lookupStaple('sesame seeds')
    expect(result).not.toBeNull()
    expect(result!.fdcId).toBe(2707586)
  })

  it('returns null for unknown ingredient', () => {
    const result = lookupStaple('unicorn tears')
    expect(result).toBeNull()
  })
})

describe('normalizeForLookup', () => {
  it('lowercases', () => {
    expect(normalizeForLookup('Chicken Breast')).toBe('chicken breast')
  })

  it('strips parentheticals', () => {
    expect(normalizeForLookup('penne pasta (uncooked)')).toBe('penne pasta')
  })

  it('strips after comma', () => {
    expect(normalizeForLookup('yellow onion, diced')).toBe('yellow onion')
  })

  it('trims whitespace', () => {
    expect(normalizeForLookup('  garlic  ')).toBe('garlic')
  })
})

describe('qtyToGrams', () => {
  it('converts weight units (pounds)', () => {
    const grams = qtyToGrams(1, 'pound', 'chicken breast')
    expect(grams).toBeCloseTo(453.592, 0)
  })

  it('converts weight units (ounces)', () => {
    const grams = qtyToGrams(8, 'ounce', 'cream cheese')
    expect(grams).toBeCloseTo(226.8, 0)
  })

  it('converts volume with density (cups of flour)', () => {
    const grams = qtyToGrams(1, 'cup', 'flour')
    // 48 tsp * 2.6 g/tsp = ~124.8g
    expect(grams).toBeGreaterThan(100)
    expect(grams).toBeLessThan(150)
  })

  it('converts volume with density (tablespoon of olive oil)', () => {
    const grams = qtyToGrams(1, 'tablespoon', 'olive oil')
    // 3 tsp * 4.5 g/tsp = 13.5g
    expect(grams).toBeCloseTo(13.5, 0)
  })

  it('converts count-based (eggs)', () => {
    const grams = qtyToGrams(2, null, 'eggs')
    expect(grams).toBe(100) // 2 * 50g
  })

  it('converts clove of garlic', () => {
    const grams = qtyToGrams(3, 'clove', 'garlic')
    expect(grams).toBe(9) // 3 * 3g
  })

  it('converts stick of butter', () => {
    const grams = qtyToGrams(1, 'stick', 'butter')
    expect(grams).toBe(113)
  })

  it('returns null for null qty', () => {
    expect(qtyToGrams(null, 'cup', 'flour')).toBeNull()
  })

  it('returns null for container units (can)', () => {
    expect(qtyToGrams(1, 'can', 'black beans')).toBeNull()
  })

  it('averages range quantities', () => {
    const grams = qtyToGrams({ min: 2, max: 4 }, 'ounce', 'cheese')
    // avg 3 * 28.35 = ~85g
    expect(grams).toBeCloseTo(85, 0)
  })
})

describe('SKIP handling: zero-calorie seasonings', () => {
  it('salt contributes zero calories to totals', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'chicken breast', raw: '1 lb chicken breast', qty: 1, unitCanonical: 'pound' }),
      makeIngredient({ ingredient: 'salt', raw: '1 tsp salt', qty: 1, unitCanonical: 'teaspoon' }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    // Salt should be matched but contribute 0 calories
    const saltItem = result!.perIngredient.find((i) => i.ingredient === 'salt')
    expect(saltItem).toBeDefined()
    expect(saltItem!.matched).toBe(true)
    expect(saltItem!.calories).toBe(0)
  })

  it('baking soda contributes zero calories', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'baking soda', raw: '1 tsp baking soda', qty: 1, unitCanonical: 'teaspoon' }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    expect(result!.perIngredient[0].calories).toBe(0)
  })
})

describe('estimateNutrition', () => {
  it('returns null for empty ingredient list', async () => {
    const recipe = makeRecipe([])
    expect(await estimateNutrition(recipe)).toBeNull()
  })

  it('computes per-serving values divided by servings', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'chicken breast', raw: '1 lb chicken breast', qty: 1, unitCanonical: 'pound' }),
    ], 4)
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    // 1 lb chicken breast ≈ 748 cal total, /4 servings ≈ 187
    expect(result!.perServing.calories).toBeGreaterThan(150)
    expect(result!.perServing.calories).toBeLessThan(220)
  })

  it('includes unmatched ingredients with null macros', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'chicken breast', raw: '1 lb chicken breast', qty: 1, unitCanonical: 'pound' }),
      makeIngredient({ ingredient: 'unicorn tears', raw: '1 cup unicorn tears', qty: 1, unitCanonical: 'cup' }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    const unmatched = result!.perIngredient.find((i) => i.ingredient === 'unicorn tears')
    expect(unmatched).toBeDefined()
    expect(unmatched!.matched).toBe(false)
    expect(unmatched!.calories).toBeNull()
  })

  it('sets high confidence when most ingredients match from staples', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'chicken breast', raw: '1 lb chicken breast', qty: 1, unitCanonical: 'pound' }),
      makeIngredient({ ingredient: 'olive oil', raw: '1 tbsp olive oil', qty: 1, unitCanonical: 'tablespoon' }),
      makeIngredient({ ingredient: 'garlic', raw: '3 cloves garlic', qty: 3, unitCanonical: 'clove' }),
      makeIngredient({ ingredient: 'salt', raw: '1 tsp salt', qty: 1, unitCanonical: 'teaspoon' }),
      makeIngredient({ ingredient: 'black pepper', raw: '1/2 tsp pepper', qty: 0.5, unitCanonical: 'teaspoon' }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
  })

  it('counts matched and total ingredients correctly', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'rice', raw: '1 cup rice', qty: 1, unitCanonical: 'cup' }),
      makeIngredient({ ingredient: 'mystery spice', raw: '1 tsp mystery spice', qty: 1, unitCanonical: 'teaspoon' }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    expect(result!.ingredientCount).toBe(2)
    // rice matches, mystery spice does not (unless USDA API finds something)
    expect(result!.matchedCount).toBeGreaterThanOrEqual(1)
  })

  it('handles "to taste" ingredients (null qty)', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'rice', raw: '1 cup rice', qty: 1, unitCanonical: 'cup' }),
      makeIngredient({ ingredient: 'salt', raw: 'salt to taste', qty: null, unitCanonical: null }),
    ])
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    // Should not error, salt with null qty should be unmatched or zero
    expect(result!.perIngredient).toHaveLength(2)
  })

  it('net carbs = carbs minus fiber', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'black beans', raw: '1 cup black beans', qty: 1, unitCanonical: 'cup' }),
    ], 1)
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    const netCarbs = result!.perServing.carbs - result!.perServing.fiber
    expect(netCarbs).toBeLessThan(result!.perServing.carbs)
    expect(netCarbs).toBeGreaterThan(0)
  })

  it('defaults to 1 serving when servings is null', async () => {
    const recipe = makeRecipe([
      makeIngredient({ ingredient: 'butter', raw: '1 tbsp butter', qty: 1, unitCanonical: 'tablespoon' }),
    ], null)
    const result = await estimateNutrition(recipe)
    expect(result).not.toBeNull()
    // With 1 serving, per-serving = total
    // 1 tbsp butter = 3 tsp * 4.7 g/tsp = 14.1g → 14.1/100 * 717 ≈ 101 cal
    expect(result!.perServing.calories).toBeGreaterThan(80)
    expect(result!.perServing.calories).toBeLessThan(120)
  })
})
