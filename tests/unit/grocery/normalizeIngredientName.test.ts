import { describe, it, expect } from 'vitest'
import { normalizeIngredientName } from '@application/grocery/normalizeIngredientName.ts'

describe('normalizeIngredientName', () => {
  it('lowercases and trims', () => {
    expect(normalizeIngredientName('  Chicken Breast  ')).toBe('chicken breast')
  })

  it('strips trailing s for basic plurals', () => {
    expect(normalizeIngredientName('onions')).toBe('onion')
    expect(normalizeIngredientName('carrots')).toBe('carrot')
    expect(normalizeIngredientName('lemons')).toBe('lemon')
  })

  it('handles -ies -> -y', () => {
    expect(normalizeIngredientName('berries')).toBe('berry')
    expect(normalizeIngredientName('cherries')).toBe('cherry')
    expect(normalizeIngredientName('strawberries')).toBe('strawberry')
  })

  it('handles -oes -> -o', () => {
    expect(normalizeIngredientName('tomatoes')).toBe('tomato')
    expect(normalizeIngredientName('potatoes')).toBe('potato')
  })

  it('handles -ves -> -f', () => {
    expect(normalizeIngredientName('halves')).toBe('half')
  })

  it('handles -ches/-shes -> strip es', () => {
    expect(normalizeIngredientName('bunches')).toBe('bunch')
  })

  it('preserves words naturally ending in s', () => {
    expect(normalizeIngredientName('hummus')).toBe('hummus')
    expect(normalizeIngredientName('asparagus')).toBe('asparagus')
    expect(normalizeIngredientName('couscous')).toBe('couscous')
  })

  it('preserves short words', () => {
    expect(normalizeIngredientName('egg')).toBe('egg')
    expect(normalizeIngredientName('oil')).toBe('oil')
  })

  it('normalizes already singular names', () => {
    expect(normalizeIngredientName('garlic')).toBe('garlic')
    expect(normalizeIngredientName('flour')).toBe('flour')
  })
})
