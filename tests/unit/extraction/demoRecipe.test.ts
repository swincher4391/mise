import { describe, expect, it } from 'vitest'
import { createDemoRecipe } from '../../../src/application/extraction/demoRecipe.ts'

describe('createDemoRecipe', () => {
  it('builds a complete recipe without any network call', () => {
    const recipe = createDemoRecipe()

    expect(recipe.title).toBe('The Best Chicken Ever')
    expect(recipe.ingredients.length).toBeGreaterThan(0)
    expect(recipe.steps.length).toBeGreaterThan(0)
    expect(recipe.description).toBeTruthy()
  })

  it('parses ingredients into structured quantities and canonical units', () => {
    const recipe = createDemoRecipe()
    const oil = recipe.ingredients.find((i) => i.raw.includes('olive oil'))

    expect(oil).toBeDefined()
    expect(oil?.qty).toBe(2)
    expect(oil?.unitCanonical).toBe('tablespoon')
    expect(oil?.ingredient).toBe('olive oil')
  })

  it('parses fractional quantities', () => {
    const recipe = createDemoRecipe()
    const pepper = recipe.ingredients.find((i) => i.raw.includes('black pepper'))

    expect(pepper?.qty).toBe(0.5)
    expect(pepper?.unitCanonical).toBe('teaspoon')
  })

  it('numbers its steps in order', () => {
    const recipe = createDemoRecipe()
    expect(recipe.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('carries timing and serving metadata so the card renders fully', () => {
    const recipe = createDemoRecipe()

    expect(recipe.servings).toBe(4)
    expect(recipe.prepTimeMinutes).toBe(10)
    expect(recipe.cookTimeMinutes).toBe(35)
    expect(recipe.totalTimeMinutes).toBe(45)
  })

  it('returns a fresh object each call so state edits do not leak', () => {
    const a = createDemoRecipe()
    const b = createDemoRecipe()

    expect(a).not.toBe(b)
    expect(a.ingredients).not.toBe(b.ingredients)
  })
})
