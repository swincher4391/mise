import { describe, it, expect } from 'vitest'
import { extractJsonLd } from '@application/extraction/extractJsonLd.ts'
import { extractMicrodata } from '@application/extraction/extractMicrodata.ts'

describe('stub JSON-LD fallthrough', () => {
  const stubJsonLdHtml = `
    <html>
    <head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Stub Recipe",
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.5" }
      }
      </script>
    </head>
    <body>
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Full Microdata Recipe</h1>
        <ul>
          <li itemprop="recipeIngredient">1 cup flour</li>
          <li itemprop="recipeIngredient">2 eggs</li>
        </ul>
        <div itemprop="recipeInstructions">
          <div itemscope itemtype="https://schema.org/HowToStep">
            <span itemprop="text">Mix ingredients together.</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  it('detects stub JSON-LD (no ingredients, no steps)', () => {
    const recipes = extractJsonLd(stubJsonLdHtml)
    expect(recipes.length).toBeGreaterThan(0)
    const raw = recipes[0]

    const hasIngredients = Array.isArray(raw.recipeIngredient) && raw.recipeIngredient.length > 0
    const hasSteps = raw.recipeInstructions != null &&
      (typeof raw.recipeInstructions === 'string' ||
       (Array.isArray(raw.recipeInstructions) && raw.recipeInstructions.length > 0))

    expect(hasIngredients).toBe(false)
    expect(hasSteps).toBe(false)
  })

  it('microdata layer has the full recipe', () => {
    const microdataRecipes = extractMicrodata(stubJsonLdHtml)
    expect(microdataRecipes.length).toBeGreaterThan(0)
    expect(microdataRecipes[0].name).toBe('Full Microdata Recipe')
    expect(microdataRecipes[0].recipeIngredient).toHaveLength(2)
  })

  it('full JSON-LD is NOT treated as a stub', () => {
    const fullHtml = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Full Recipe",
        "recipeIngredient": ["1 cup flour", "2 eggs"],
        "recipeInstructions": [
          {"@type": "HowToStep", "text": "Mix well."}
        ]
      }
      </script>
      </head><body></body></html>
    `
    const recipes = extractJsonLd(fullHtml)
    expect(recipes.length).toBeGreaterThan(0)
    const raw = recipes[0]

    const hasIngredients = Array.isArray(raw.recipeIngredient) && raw.recipeIngredient.length > 0
    const hasSteps = raw.recipeInstructions != null &&
      (typeof raw.recipeInstructions === 'string' ||
       (Array.isArray(raw.recipeInstructions) && raw.recipeInstructions.length > 0))

    expect(hasIngredients || hasSteps).toBe(true)
  })
})
