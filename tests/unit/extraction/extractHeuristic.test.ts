import { describe, it, expect } from 'vitest'
import { extractHeuristic } from '@application/extraction/extractHeuristic.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

describe('extractHeuristic', () => {
  it('extracts ingredients and steps from heading-based HTML', () => {
    const html = `
      <html><body>
        <h1>Cheesy Taco Casserole</h1>
        <h2>Ingredients</h2>
        <ul>
          <li>500 g ground beef</li>
          <li>1 small onion, chopped</li>
          <li>2 cups shredded cheese</li>
        </ul>
        <h2>Instructions</h2>
        <p>Preheat oven to 350°F.</p>
        <p>Brown the beef in a skillet.</p>
        <p>Layer beef and cheese in a baking dish.</p>
        <p>Bake for 25 minutes.</p>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    expect(result.name).toBe('Cheesy Taco Casserole')
    expect(result.recipeIngredient).toHaveLength(3)
    expect(result.recipeInstructions).toHaveLength(4)
  })

  it('handles emoji-prefixed headings', () => {
    const html = `
      <html><body>
        <h1>Soup Recipe</h1>
        <h2>🛒 Ingredients</h2>
        <ul><li>4 cups broth</li><li>1 cup rice</li></ul>
        <h2>👩‍🍳 Instructions</h2>
        <p>Bring broth to a boil.</p>
        <p>Add rice and simmer.</p>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    expect(result.recipeIngredient).toHaveLength(2)
    expect(result.recipeInstructions).toHaveLength(2)
  })

  it('handles "Directions" as instruction heading', () => {
    const html = `
      <html><body>
        <h1>Simple Pasta</h1>
        <h2>Ingredients</h2>
        <ul><li>1 lb pasta</li></ul>
        <h2>Directions</h2>
        <p>Boil water. Cook pasta for 8 minutes.</p>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    expect(result.recipeInstructions.length).toBeGreaterThan(0)
  })

  it('stops at non-recipe sections like Tips or Variations', () => {
    const html = `
      <html><body>
        <h1>Test Recipe</h1>
        <h2>Ingredients</h2>
        <ul><li>1 cup flour</li></ul>
        <h2>Instructions</h2>
        <p>Mix well.</p>
        <h2>Serving Tips</h2>
        <ul><li>Serve with salad</li></ul>
        <h2>Variations</h2>
        <ul><li>Try with chicken</li></ul>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    expect(result.recipeIngredient).toHaveLength(1)
    expect(result.recipeInstructions).toHaveLength(1)
  })

  it('extracts steps from numbered sub-headings with paragraphs', () => {
    const html = `
      <html><body>
        <h1>Taco Casserole</h1>
        <h2>Ingredients</h2>
        <ul><li>1 lb beef</li></ul>
        <h2>Instructions</h2>
        <h3>1. Cook the Beef</h3>
        <p>Heat a skillet over medium heat.<br>Brown the beef.</p>
        <h3>2. Assemble</h3>
        <p>Layer in a baking dish.</p>
        <h3>3. Bake</h3>
        <p>Bake for 25 minutes.</p>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    // Sub-heading text is prepended to step
    expect(result.recipeInstructions[0].text).toContain('Cook the Beef')
    expect(result.recipeInstructions[0].text).toContain('Heat a skillet')
    expect(result.recipeInstructions.length).toBe(4) // 2 from br-split + 1 + 1
  })

  it('returns null when no recipe headings found', () => {
    const html = `
      <html><body>
        <h1>About Us</h1>
        <p>We are a food blog.</p>
      </body></html>
    `
    expect(extractHeuristic(html)).toBeNull()
  })

  it('returns null when headings exist but no content', () => {
    const html = `
      <html><body>
        <h2>Ingredients</h2>
        <h2>Instructions</h2>
      </body></html>
    `
    expect(extractHeuristic(html)).toBeNull()
  })

  it('filters ad script text from ingredients and steps', () => {
    const html = `
      <html><body>
        <h1>Clean Recipe</h1>
        <h2>Ingredients</h2>
        <ul>
          <li>1 cup flour</li>
          <li>ezstandalone.cmd.push(function () { ezstandalone.showAds(909); });</li>
          <li>2 eggs</li>
        </ul>
        <h2>Instructions</h2>
        <p>Mix ingredients.</p>
      </body></html>
    `
    const result = extractHeuristic(html)
    expect(result).not.toBeNull()
    expect(result.recipeIngredient).toHaveLength(2)
    expect(result.recipeIngredient).toContain('1 cup flour')
    expect(result.recipeIngredient).toContain('2 eggs')
  })

  it('produces a valid Recipe through normalizeRecipe', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://example.com/photo.jpg">
      </head><body>
        <h1>Full Recipe Test</h1>
        <h2>Ingredients</h2>
        <ul>
          <li>1 cup flour</li>
          <li>2 eggs</li>
          <li>1/2 cup milk</li>
        </ul>
        <h2>Instructions</h2>
        <p>Mix dry ingredients.</p>
        <p>Add eggs and milk.</p>
        <p>Bake at 350°F for 30 minutes.</p>
      </body></html>
    `
    const raw = extractHeuristic(html)
    expect(raw).not.toBeNull()

    const recipe = normalizeRecipe(raw!, 'https://example.com/recipe', html)
    expect(recipe.title).toBe('Full Recipe Test')
    expect(recipe.ingredients).toHaveLength(3)
    expect(recipe.steps).toHaveLength(3)
    expect(recipe.imageUrl).toBe('https://example.com/photo.jpg')
  })
})
