import { describe, it, expect } from 'vitest'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'

const FULL_EXAMPLE = `                     * Exported from MasterCook *

Stewed Tomatoes

Recipe By :

Serving Size : 0 Preparation Time :0:00

Categories :

Amount  Measure       Ingredient -- Preparation Method
--------  ------------  --------------------------------
     6                  tomatoes -- fresh or canned
     2  T.             butter
                        Salt and pepper
                        Crumbs or flour

Pour boiling water on fresh tomatoes, after they have remained covered for one minute drain them and plunge them into cold water. Slip off the skins, remove the hard stem ends, and cut the tomatoes into pieces. Cook them in their own juice in a saucepan until tender; add butter, salt and pepper. Bread crumbs or cracker crumbs, or a little flour blended with butter, may be added for thickening.

The Woman's World Cook Book, 1961

- - - - - - - - - - - - - - - - - - -

Per Serving (excluding unknown items): 1781 Calories; 186g Fat (90.8% calories from fat); 8g Protein; 34g Carbohydrate; 8g Dietary Fiber; 497mg Cholesterol; 1940mg Sodium. Exchanges: 6 1/2 Vegetable; 36 1/2 Fat.

Nutr. Assoc. : 0 0 0 0`

describe('parseMasterCookRecipe (via parseTextRecipe)', () => {
  it('should extract title from the full example', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    expect(result.title).toBe('Stewed Tomatoes')
  })

  it('should extract ingredients with amounts and prep methods', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    expect(result.ingredientLines).toHaveLength(4)
    expect(result.ingredientLines[0]).toContain('6')
    expect(result.ingredientLines[0]).toContain('tomatoes')
    expect(result.ingredientLines[0]).toContain('fresh or canned')
    expect(result.ingredientLines[1]).toContain('butter')
    expect(result.ingredientLines).toContainEqual(expect.stringContaining('Salt and pepper'))
    expect(result.ingredientLines).toContainEqual(expect.stringContaining('Crumbs or flour'))
  })

  it('should convert -- to comma in ingredient prep methods', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    const tomato = result.ingredientLines.find((l) => l.includes('tomatoes'))!
    expect(tomato).not.toContain('--')
    expect(tomato).toContain(', ')
  })

  it('should extract steps and stop before nutrition', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    expect(result.stepLines.length).toBeGreaterThanOrEqual(1)
    expect(result.stepLines[0]).toContain('Pour boiling water')
    // Should not include nutrition
    const allSteps = result.stepLines.join(' ')
    expect(allSteps).not.toContain('Calories')
    expect(allSteps).not.toContain('Per Serving')
    expect(allSteps).not.toContain('Nutr. Assoc')
  })

  it('should filter out source attribution lines from steps', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    const allSteps = result.stepLines.join(' ')
    expect(allSteps).not.toContain("Woman's World Cook Book")
    expect(allSteps).not.toContain('1961')
  })

  it('should not include metadata lines in output', () => {
    const result = parseTextRecipe(FULL_EXAMPLE)
    const all = [...result.ingredientLines, ...result.stepLines].join(' ')
    expect(all).not.toContain('Recipe By')
    expect(all).not.toContain('Serving Size')
    expect(all).not.toContain('Categories')
    expect(all).not.toContain('Amount  Measure')
  })

  it('should handle missing amounts', () => {
    const text = `* Exported from MasterCook *

Simple Dish

Recipe By :
Categories :

Amount  Measure       Ingredient -- Preparation Method
--------  ------------  --------------------------------
                        Salt
                        Pepper
     1  cup            flour

Combine all ingredients.
`
    const result = parseTextRecipe(text)
    expect(result.title).toBe('Simple Dish')
    expect(result.ingredientLines).toHaveLength(3)
    expect(result.ingredientLines).toContainEqual(expect.stringContaining('Salt'))
    expect(result.ingredientLines).toContainEqual(expect.stringContaining('Pepper'))
    expect(result.ingredientLines).toContainEqual(expect.stringContaining('flour'))
    expect(result.stepLines).toContainEqual(expect.stringContaining('Combine'))
  })

  it('should handle recipe with no nutrition block', () => {
    const text = `* Exported from MasterCook *

No Nutrition Recipe

Recipe By :
Categories :

Amount  Measure       Ingredient -- Preparation Method
--------  ------------  --------------------------------
     2  cups           water
     1  tsp            salt

Boil the water and add salt.
`
    const result = parseTextRecipe(text)
    expect(result.title).toBe('No Nutrition Recipe')
    expect(result.ingredientLines).toHaveLength(2)
    expect(result.stepLines[0]).toContain('Boil the water')
  })

  it('should handle empty categories', () => {
    const text = `* Exported from MasterCook *

Basic Recipe

Recipe By :
Serving Size : 4 Preparation Time :0:30
Categories :

Amount  Measure       Ingredient -- Preparation Method
--------  ------------  --------------------------------
     1  lb             beef

Brown the beef in a skillet.
`
    const result = parseTextRecipe(text)
    expect(result.title).toBe('Basic Recipe')
    expect(result.ingredientLines).toHaveLength(1)
    expect(result.ingredientLines[0]).toContain('beef')
  })
})
