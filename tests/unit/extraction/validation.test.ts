import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

const FIXTURES_DIR = join(__dirname, 'fixtures')

/**
 * Validation test suite: runs all HTML fixtures through the full
 * extraction pipeline and verifies basic correctness.
 */
describe('Extraction pipeline validation', () => {
  const htmlFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.html'))

  it('should have at least 5 test fixtures', () => {
    expect(htmlFiles.length).toBeGreaterThanOrEqual(5)
  })

  for (const file of htmlFiles) {
    describe(`fixture: ${file}`, () => {
      const html = readFileSync(join(FIXTURES_DIR, file), 'utf-8')

      it('should extract at least one Recipe from JSON-LD', () => {
        const recipes = extractJsonLd(html)
        expect(recipes.length).toBeGreaterThanOrEqual(1)
        expect(recipes[0]['@type']).toBeDefined()
      })

      it('should normalize to a valid Recipe object', () => {
        const recipes = extractJsonLd(html)
        if (recipes.length === 0) return

        const recipe = normalizeRecipe(recipes[0], `https://example.com/${file}`)

        // Required fields exist
        expect(recipe.id).toBeTruthy()
        expect(recipe.title).toBeTruthy()
        expect(recipe.title).not.toBe('Untitled Recipe')
        expect(recipe.extractionLayer).toBe('json-ld')
        expect(recipe.extractedAt).toBeTruthy()

        // Ingredients parsed
        expect(recipe.ingredients.length).toBeGreaterThan(0)
        for (const ing of recipe.ingredients) {
          expect(ing.id).toBeTruthy()
          expect(ing.raw).toBeTruthy()
          expect(ing.ingredient).toBeTruthy()
        }

        // Steps parsed
        expect(recipe.steps.length).toBeGreaterThan(0)
        for (const step of recipe.steps) {
          expect(step.text).toBeTruthy()
          expect(step.order).toBeGreaterThan(0)
        }
      })

      it('should parse ingredient quantities for most ingredients', () => {
        const recipes = extractJsonLd(html)
        if (recipes.length === 0) return

        const recipe = normalizeRecipe(recipes[0], `https://example.com/${file}`)
        const withQty = recipe.ingredients.filter((i) => i.qty !== null)
        const ratio = withQty.length / recipe.ingredients.length

        // At least 50% of ingredients should have a parsed quantity
        expect(ratio).toBeGreaterThanOrEqual(0.5)
      })

      it('should extract time information when available', () => {
        const recipes = extractJsonLd(html)
        if (recipes.length === 0) return

        const recipe = normalizeRecipe(recipes[0], `https://example.com/${file}`)
        const hasTime = recipe.prepTimeMinutes || recipe.cookTimeMinutes || recipe.totalTimeMinutes
        // Most recipes should have at least one time field
        expect(hasTime).toBeTruthy()
      })
    })
  }
})
