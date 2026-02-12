import { describe, it, expect } from 'vitest'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures', 'microdata-recipe.html'),
  'utf-8',
)

describe('extractMicrodata', () => {
  it('should extract a Recipe from microdata HTML', () => {
    const recipes = extractMicrodata(fixtureHtml)
    expect(recipes).toHaveLength(1)
    expect(recipes[0]['@type']).toBe('Recipe')
  })

  it('should extract recipe name', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.name).toBe('Classic Banana Bread')
  })

  it('should extract description', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.description).toContain('moist and delicious')
  })

  it('should extract image URL', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.image).toBe('https://example.com/banana-bread.jpg')
  })

  it('should extract nested author name', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.author).toBeDefined()
    expect(recipe.author.name).toBe('Jane Baker')
  })

  it('should extract ISO durations from meta elements', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.prepTime).toBe('PT15M')
    expect(recipe.cookTime).toBe('PT60M')
    expect(recipe.totalTime).toBe('PT1H15M')
  })

  it('should extract recipeYield', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.recipeYield).toBe('1 loaf')
  })

  it('should extract all ingredients as an array', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.recipeIngredient).toHaveLength(8)
    expect(recipe.recipeIngredient[0]).toBe('3 ripe bananas, mashed')
    expect(recipe.recipeIngredient[7]).toBe('1 1/2 cups all-purpose flour')
  })

  it('should extract instructions as HowToStep objects', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.recipeInstructions).toHaveLength(5)
    expect(recipe.recipeInstructions[0].text).toContain('Preheat oven')
    expect(recipe.recipeInstructions[0]['@type']).toBe('HowToStep')
  })

  it('should extract category and cuisine', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.recipeCategory).toBe('Dessert')
    expect(recipe.recipeCuisine).toBe('American')
  })

  it('should extract keywords from meta content', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.keywords).toBe('banana bread, baking, dessert')
  })

  it('should extract nested nutrition information', () => {
    const recipe = extractMicrodata(fixtureHtml)[0]
    expect(recipe.nutrition).toBeDefined()
    expect(recipe.nutrition.calories).toBe('196 calories')
    expect(recipe.nutrition.fatContent).toBe('7g')
    expect(recipe.nutrition.proteinContent).toBe('3g')
  })

  it('should return empty array for HTML without microdata', () => {
    const html = '<html><body><h1>Not a recipe</h1></body></html>'
    expect(extractMicrodata(html)).toHaveLength(0)
  })

  it('should return empty array for non-recipe microdata', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Article">
        <span itemprop="name">Some Article</span>
      </div>
    `
    expect(extractMicrodata(html)).toHaveLength(0)
  })

  it('should handle http schema.org URLs', () => {
    const html = `
      <div itemscope itemtype="http://schema.org/Recipe">
        <span itemprop="name">Simple Recipe</span>
        <span itemprop="recipeIngredient">1 cup flour</span>
      </div>
    `
    const recipes = extractMicrodata(html)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Simple Recipe')
  })
})
