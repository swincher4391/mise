import { describe, it, expect } from 'vitest'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'

describe('parseTextRecipe', () => {
  it('should extract title, ingredients, and steps with explicit headers', () => {
    const text = `Chicken Parmesan

Ingredients:
- 2 chicken breasts
- 1 cup marinara sauce
- 1 cup mozzarella cheese

Instructions:
1. Pound chicken to even thickness
2. Bread and fry the chicken
3. Top with sauce and cheese, bake at 400°F`

    const result = parseTextRecipe(text)
    expect(result.title).toBe('Chicken Parmesan')
    expect(result.ingredientLines).toEqual([
      '2 chicken breasts',
      '1 cup marinara sauce',
      '1 cup mozzarella cheese',
    ])
    expect(result.stepLines).toEqual([
      'Pound chicken to even thickness',
      'Bread and fry the chicken',
      'Top with sauce and cheese, bake at 400°F',
    ])
  })

  it('should auto-detect bullets as ingredients and numbered lines as steps without headers', () => {
    const text = `Simple Pasta

- 1 lb spaghetti
- 2 tbsp olive oil
- 3 cloves garlic
1. Boil pasta until al dente
2. Sauté garlic in olive oil
3. Toss pasta with garlic oil`

    const result = parseTextRecipe(text)
    expect(result.title).toBe('Simple Pasta')
    expect(result.ingredientLines).toEqual([
      '1 lb spaghetti',
      '2 tbsp olive oil',
      '3 cloves garlic',
    ])
    expect(result.stepLines).toEqual([
      'Boil pasta until al dente',
      'Sauté garlic in olive oil',
      'Toss pasta with garlic oil',
    ])
  })

  it('should extract title from first line and strip leading symbols', () => {
    const text = `=-[] My Recipe Title
Ingredients:
- flour`

    const result = parseTextRecipe(text)
    expect(result.title).toBe('My Recipe Title')
  })

  it('should strip list markers from ingredient and step lines', () => {
    const text = `Test Recipe

Ingredients:
- flour
* sugar
• butter

Steps:
1. Mix together
2. Bake`

    const result = parseTextRecipe(text)
    expect(result.ingredientLines).toEqual(['flour', 'sugar', 'butter'])
    expect(result.stepLines).toEqual(['Mix together', 'Bake'])
  })

  it('should return empty arrays for empty input', () => {
    const result = parseTextRecipe('')
    expect(result.title).toBe('')
    expect(result.ingredientLines).toEqual([])
    expect(result.stepLines).toEqual([])
  })

  it('should return empty arrays for whitespace-only input', () => {
    const result = parseTextRecipe('   \n  \n   ')
    expect(result.title).toBe('')
    expect(result.ingredientLines).toEqual([])
    expect(result.stepLines).toEqual([])
  })

  it('should handle "Directions" as a step header', () => {
    const text = `My Recipe
Ingredients:
- salt
Directions:
1. Add salt`

    const result = parseTextRecipe(text)
    expect(result.stepLines).toEqual(['Add salt'])
  })

  it('should handle "Method" as a step header', () => {
    const text = `My Recipe
Ingredients:
- salt
Method:
1. Add salt`

    const result = parseTextRecipe(text)
    expect(result.stepLines).toEqual(['Add salt'])
  })

  it('should auto-detect quantity patterns as ingredients', () => {
    const text = `Quick Salad
2 cups lettuce
1 tbsp dressing
1. Toss together`

    const result = parseTextRecipe(text)
    expect(result.ingredientLines).toEqual(['2 cups lettuce', '1 tbsp dressing'])
    expect(result.stepLines).toEqual(['Toss together'])
  })

  it('should handle mixed content with some lines before and after headers', () => {
    const text = `Soup Recipe
- 1 onion
- 2 carrots
Ingredients:
- 4 cups broth
- salt
Instructions:
1. Sauté vegetables
2. Add broth and simmer`

    const result = parseTextRecipe(text)
    // Lines before header are auto-detected as ingredients (bullet format)
    expect(result.ingredientLines).toContain('1 onion')
    expect(result.ingredientLines).toContain('2 carrots')
    // Lines after Ingredients: header
    expect(result.ingredientLines).toContain('4 cups broth')
    expect(result.ingredientLines).toContain('salt')
    expect(result.stepLines).toEqual(['Sauté vegetables', 'Add broth and simmer'])
  })

  it('should handle title-only input with no ingredients or steps', () => {
    const result = parseTextRecipe('Just a Title')
    expect(result.title).toBe('Just a Title')
    expect(result.ingredientLines).toEqual([])
    expect(result.stepLines).toEqual([])
  })

  it('should handle text starting with a section header (no title line)', () => {
    const text = `Ingredients

Bacon trimmings/end pieces (diced) - 1/2 pound
Vidalia Onions - 2
Smoked sausage (diced) - 1 1/2 pounds
Chicken breast & thighs - usually 5 thighs and two breasts.
Parboiled rice - 5 cups

Instructions

1. Get a pot big enough to fix this amount of food.
2. Start by frying up your bacon trimmings until crispy.
3. Add in smoked sausage, and brown.`

    const result = parseTextRecipe(text)
    expect(result.title).toBe('Pasted Recipe')
    expect(result.ingredientLines).toHaveLength(5)
    expect(result.ingredientLines[0]).toBe('Bacon trimmings/end pieces (diced) - 1/2 pound')
    expect(result.stepLines).toHaveLength(3)
    expect(result.stepLines[0]).toBe('Get a pot big enough to fix this amount of food.')
  })

  it('should skip UI artifacts from OCR output', () => {
    const text = `My Recipe
®Some artifact
Ingredients:
- flour
<>Another artifact
- sugar`

    const result = parseTextRecipe(text)
    expect(result.ingredientLines).toEqual(['flour', 'sugar'])
  })

  it('should split paragraph instructions into sentences and filter attribution', () => {
    const text = `Spaghetti Casserole
Ingredients
1 package spaghetti (8 oz.)
1 pound beef, ground
1 can tomato soup
1/4 cup chopped onion
1/4 cup chopped green pepper
2 teaspoon fat
Instructions
Brown onion, peppers and meat in hot fat. Add tomato soup. Pour over cooked spaghetti and pour entire mixture into a buttered casserole. This dish may be prepared and store in Kelvinator food compartment before baking. Bake in moderate oven 350 degrees F 30 to 45 minutes.
The Kelvinator Book of Recipes, date unknown`

    const result = parseTextRecipe(text)
    expect(result.title).toBe('Spaghetti Casserole')
    expect(result.ingredientLines).toHaveLength(6)
    expect(result.stepLines).toContainEqual(expect.stringContaining('Brown onion'))
    expect(result.stepLines).toContainEqual(expect.stringContaining('Add tomato soup'))
    expect(result.stepLines).toContainEqual(expect.stringContaining('Pour over cooked spaghetti'))
    expect(result.stepLines).toContainEqual(expect.stringContaining('Bake in moderate oven'))
    // Attribution line should be filtered
    expect(result.stepLines.join(' ')).not.toContain('Kelvinator Book')
  })
})
