import { describe, it, expect } from 'vitest'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { formatQuantity } from '@application/scaler/formatQuantity.ts'
import { convertUnit } from '@application/scaler/convertUnit.ts'
import type { Ingredient, Range } from '@domain/models/Ingredient.ts'

function makeIngredient(overrides: Partial<Ingredient>): Ingredient {
  return {
    id: 'test',
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

describe('scaleIngredients', () => {
  it('should scale up by 2x', () => {
    const ingredients = [
      makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'flour' }),
      makeIngredient({ qty: 2, unitCanonical: 'tablespoon', ingredient: 'sugar' }),
    ]
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].scaledQty).toBe(2)
    expect(scaled[1].scaledQty).toBeCloseTo(4)
  })

  it('should scale down by half', () => {
    const ingredients = [
      makeIngredient({ qty: 2, unitCanonical: 'cup', ingredient: 'flour' }),
    ]
    const scaled = scaleIngredients(ingredients, 4, 2)
    expect(scaled[0].scaledQty).toBe(1)
  })

  it('should leave null qty unchanged', () => {
    const ingredients = [
      makeIngredient({ qty: null, ingredient: 'salt to taste' }),
    ]
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].scaledQty).toBeNull()
  })

  it('should scale both bounds of a Range', () => {
    const ingredients = [
      makeIngredient({ qty: { min: 2, max: 3 }, ingredient: 'tomatoes' }),
    ]
    const scaled = scaleIngredients(ingredients, 4, 8)
    const range = scaled[0].scaledQty as Range
    expect(range.min).toBe(4)
    expect(range.max).toBe(6)
  })

  it('should handle original servings of 0', () => {
    const ingredients = [
      makeIngredient({ qty: 1, unitCanonical: 'cup', ingredient: 'flour' }),
    ]
    const scaled = scaleIngredients(ingredients, 0, 4)
    expect(scaled[0].scaledQty).toBe(1) // unchanged
  })

  it('should convert awkward units when scaling up', () => {
    // 16 teaspoons = 1/3 cup, which should convert
    const ingredients = [
      makeIngredient({ qty: 4, unitCanonical: 'teaspoon', ingredient: 'sugar' }),
    ]
    const scaled = scaleIngredients(ingredients, 1, 4)
    // 16 tsp should convert to a larger unit
    expect(scaled[0].displayUnit).not.toBe('teaspoon')
  })
})

describe('formatQuantity', () => {
  it('should format 0.5 as "1/2"', () => {
    expect(formatQuantity(0.5)).toBe('1/2')
  })

  it('should format 0.333 as "1/3"', () => {
    expect(formatQuantity(0.333)).toBe('1/3')
  })

  it('should format 1.5 as "1 1/2"', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2')
  })

  it('should format 2.0 as "2"', () => {
    expect(formatQuantity(2)).toBe('2')
  })

  it('should format 0.25 as "1/4"', () => {
    expect(formatQuantity(0.25)).toBe('1/4')
  })

  it('should format 0.75 as "3/4"', () => {
    expect(formatQuantity(0.75)).toBe('3/4')
  })

  it('should format 2.667 as "2 2/3"', () => {
    expect(formatQuantity(2.667)).toBe('2 2/3')
  })

  it('should format 1.7 as decimal', () => {
    expect(formatQuantity(1.7)).toBe('1.7')
  })

  it('should format 0.125 as "1/8"', () => {
    expect(formatQuantity(0.125)).toBe('1/8')
  })
})

describe('convertUnit', () => {
  it('should convert small cups to tablespoons', () => {
    // 0.125 cup = 6 tsp = 2 tbsp
    const result = convertUnit(0.125, 'cup')
    expect(result).not.toBeNull()
    expect(result!.unit).toBe('tablespoon')
  })

  it('should convert many teaspoons to cups', () => {
    // 48 tsp = 1 cup
    const result = convertUnit(48, 'teaspoon')
    expect(result).not.toBeNull()
    expect(result!.unit).toBe('cup')
    expect(result!.qty).toBeCloseTo(1)
  })

  it('should return null when no conversion needed', () => {
    const result = convertUnit(1, 'cup')
    expect(result).toBeNull()
  })

  it('should convert weight units', () => {
    // 32 ounces = 2 pounds
    const result = convertUnit(32, 'ounce')
    expect(result).not.toBeNull()
    expect(result!.unit).toBe('pound')
  })

  it('should return null for non-convertible units', () => {
    const result = convertUnit(3, 'clove')
    expect(result).toBeNull()
  })
})
