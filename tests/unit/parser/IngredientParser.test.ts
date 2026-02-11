import { describe, it, expect, beforeEach } from 'vitest'
import { parseIngredient, resetIdCounter } from '@application/parser/IngredientParser.ts'
import type { Range } from '@domain/models/Ingredient.ts'
import fixtures from './fixtures/ingredients.json'

interface Fixture {
  raw: string
  qty: number | { min: number; max: number } | null
  unit: string | null
  ingredient: string
  prep: string | null
  optional: boolean
  notes?: string
}

beforeEach(() => {
  resetIdCounter()
})

describe('IngredientParser', () => {
  const typedFixtures = fixtures as Fixture[]

  for (const fixture of typedFixtures) {
    it(`should parse: "${fixture.raw}"`, () => {
      const result = parseIngredient(fixture.raw)

      // Check quantity
      if (fixture.qty === null) {
        expect(result.qty).toBeNull()
      } else if (typeof fixture.qty === 'object' && 'min' in fixture.qty) {
        const range = result.qty as Range
        expect(range).toBeTruthy()
        expect(range.min).toBe(fixture.qty.min)
        expect(range.max).toBe(fixture.qty.max)
      } else {
        expect(result.qty).toBeCloseTo(fixture.qty as number, 2)
      }

      // Check unit
      expect(result.unitCanonical).toBe(fixture.unit)

      // Check ingredient name
      expect(result.ingredient.toLowerCase()).toBe(fixture.ingredient.toLowerCase())

      // Check prep
      if (fixture.prep === null) {
        expect(result.prep).toBeNull()
      } else {
        expect(result.prep?.toLowerCase()).toBe(fixture.prep.toLowerCase())
      }

      // Check optional
      expect(result.optional).toBe(fixture.optional)

      // Check notes if specified
      if (fixture.notes) {
        expect(result.notes).toContain(fixture.notes)
      }

      // Every result should have an id
      expect(result.id).toBeTruthy()
      expect(result.raw).toBe(fixture.raw)
    })
  }
})

describe('IngredientParser edge cases', () => {
  it('should handle empty string', () => {
    const result = parseIngredient('')
    expect(result.qty).toBeNull()
    expect(result.ingredient).toBe('')
  })

  it('should handle unicode fraction ½', () => {
    const result = parseIngredient('½ cup milk')
    expect(result.qty).toBeCloseTo(0.5, 2)
    expect(result.unitCanonical).toBe('cup')
    expect(result.ingredient.toLowerCase()).toBe('milk')
  })

  it('should handle unicode fraction ¾', () => {
    const result = parseIngredient('¾ teaspoon salt')
    expect(result.qty).toBeCloseTo(0.75, 2)
    expect(result.unitCanonical).toBe('teaspoon')
  })

  it('should generate unique ids', () => {
    const a = parseIngredient('1 cup flour')
    const b = parseIngredient('2 cups sugar')
    expect(a.id).not.toBe(b.id)
  })
})
