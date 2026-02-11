import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'
import { parseIsoDuration } from '@application/extraction/parseIsoDuration.ts'

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8')
}

describe('extractJsonLd', () => {
  it('should extract a simple Recipe from JSON-LD', () => {
    const html = loadFixture('simple-recipe.html')
    const recipes = extractJsonLd(html)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Classic Chocolate Chip Cookies')
    expect(recipes[0].recipeIngredient).toHaveLength(9)
  })

  it('should find Recipe in @graph array', () => {
    const html = loadFixture('graph-recipe.html')
    const recipes = extractJsonLd(html)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Simple Garlic Pasta')
  })

  it('should handle array @type', () => {
    const html = loadFixture('sections-recipe.html')
    const recipes = extractJsonLd(html)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Chicken Stir Fry')
  })

  it('should return empty array when no Recipe found', () => {
    const html = '<html><body>No recipe here</body></html>'
    expect(extractJsonLd(html)).toHaveLength(0)
  })

  it('should handle invalid JSON gracefully', () => {
    const html = '<script type="application/ld+json">{invalid json}</script>'
    expect(extractJsonLd(html)).toHaveLength(0)
  })

  it('should handle multiple script blocks', () => {
    const html = `
      <script type="application/ld+json">{"@type":"WebPage","name":"Test"}</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Found It"}</script>
    `
    const recipes = extractJsonLd(html)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Found It')
  })
})

describe('normalizeRecipe', () => {
  it('should normalize a simple recipe', () => {
    const html = loadFixture('simple-recipe.html')
    const jsonLd = extractJsonLd(html)[0]
    const recipe = normalizeRecipe(jsonLd, 'https://example.com/cookies')

    expect(recipe.title).toBe('Classic Chocolate Chip Cookies')
    expect(recipe.author).toBe('Jane Baker')
    expect(recipe.servings).toBe(24)
    expect(recipe.prepTimeMinutes).toBe(15)
    expect(recipe.cookTimeMinutes).toBe(12)
    expect(recipe.totalTimeMinutes).toBe(27)
    expect(recipe.ingredients).toHaveLength(9)
    expect(recipe.steps).toHaveLength(7)
    expect(recipe.sourceUrl).toBe('https://example.com/cookies')
    expect(recipe.sourceDomain).toBe('example.com')
    expect(recipe.imageUrl).toBe('https://example.com/cookies.jpg')
    expect(recipe.extractionLayer).toBe('json-ld')
    expect(recipe.keywords).toContain('cookies')
    expect(recipe.categories).toContain('Dessert')
    expect(recipe.cuisines).toContain('American')
  })

  it('should handle @graph recipe with array yield and image', () => {
    const html = loadFixture('graph-recipe.html')
    const jsonLd = extractJsonLd(html)[0]
    const recipe = normalizeRecipe(jsonLd, 'https://example.com/pasta')

    expect(recipe.title).toBe('Simple Garlic Pasta')
    expect(recipe.servings).toBe(4)
    expect(recipe.imageUrl).toBe('https://example.com/pasta1.jpg')
    expect(recipe.ingredients).toHaveLength(6)
    // String instructions -> each string is a step
    expect(recipe.steps).toHaveLength(5)
    expect(recipe.author).toBe('Chef Mario')
  })

  it('should handle HowToSection instructions', () => {
    const html = loadFixture('sections-recipe.html')
    const jsonLd = extractJsonLd(html)[0]
    const recipe = normalizeRecipe(jsonLd, 'https://example.com/stirfry')

    expect(recipe.title).toBe('Chicken Stir Fry')
    // 2 section names + 5 steps = 7
    expect(recipe.steps.length).toBeGreaterThanOrEqual(5)
    expect(recipe.imageUrl).toBe('https://example.com/stirfry.jpg')
  })

  it('should parse nutrition info', () => {
    const html = loadFixture('simple-recipe.html')
    const jsonLd = extractJsonLd(html)[0]
    const recipe = normalizeRecipe(jsonLd, 'https://example.com/cookies')

    expect(recipe.nutrition).not.toBeNull()
    expect(recipe.nutrition!.calories).toBe(180)
    expect(recipe.nutrition!.fatG).toBe(9)
    expect(recipe.nutrition!.proteinG).toBe(2)
  })

  it('should parse ingredient details', () => {
    const html = loadFixture('simple-recipe.html')
    const jsonLd = extractJsonLd(html)[0]
    const recipe = normalizeRecipe(jsonLd, 'https://example.com/cookies')

    const flour = recipe.ingredients[0]
    expect(flour.qty).toBeCloseTo(2.25)
    expect(flour.unitCanonical).toBe('cup')
    expect(flour.ingredient.toLowerCase()).toContain('flour')

    const butter = recipe.ingredients[3]
    expect(butter.qty).toBe(1)
    expect(butter.unitCanonical).toBe('cup')
    expect(butter.prep?.toLowerCase()).toContain('softened')
  })
})

describe('parseIsoDuration', () => {
  it('should parse PT1H30M to 90', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90)
  })

  it('should parse PT45M to 45', () => {
    expect(parseIsoDuration('PT45M')).toBe(45)
  })

  it('should parse PT2H to 120', () => {
    expect(parseIsoDuration('PT2H')).toBe(120)
  })

  it('should parse P0DT1H30M to 90', () => {
    expect(parseIsoDuration('P0DT1H30M')).toBe(90)
  })

  it('should parse PT30S to 1 (rounded)', () => {
    expect(parseIsoDuration('PT30S')).toBe(1)
  })

  it('should return null for null input', () => {
    expect(parseIsoDuration(null)).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(parseIsoDuration('')).toBeNull()
  })

  it('should return null for invalid duration', () => {
    expect(parseIsoDuration('not a duration')).toBeNull()
  })

  it('should parse P1DT2H to 1560', () => {
    expect(parseIsoDuration('P1DT2H')).toBe(1560)
  })
})
