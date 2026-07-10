import type { Recipe } from '@domain/models/Recipe.ts'
import { createManualRecipe } from './createManualRecipe.ts'

/**
 * The "see it in action" recipe for first-time visitors.
 *
 * Built locally rather than extracted over the network: this is the aha moment,
 * and gating it on API latency (or letting it fail) loses the visitor at the
 * exact point they decided to try the product.
 */
const DEMO_SOURCE_URL = 'https://mise.swinch.dev/the-best-chicken-ever/'

const DEMO_INGREDIENTS = [
  '4 bone-in, skin-on chicken thighs',
  '2 tbsp olive oil',
  '4 cloves garlic, minced',
  '1 tsp smoked paprika',
  '1 tsp kosher salt',
  '1/2 tsp black pepper',
  '1 lemon, halved',
  '2 sprigs fresh thyme',
]

const DEMO_STEPS = [
  'Preheat the oven to 425°F.',
  'Pat the chicken thighs completely dry, then rub them with olive oil.',
  'Combine the garlic, smoked paprika, salt, and pepper, and rub the mixture under and over the skin.',
  'Arrange the thighs skin-side up in a cast-iron skillet with the thyme and lemon halves cut-side down.',
  'Roast for 35 minutes, until the skin is deep golden and the internal temperature reaches 165°F.',
  'Rest for 5 minutes, then squeeze the roasted lemon over the top before serving.',
]

export function createDemoRecipe(): Recipe {
  const recipe = createManualRecipe({
    title: 'The Best Chicken Ever',
    ingredientLines: DEMO_INGREDIENTS,
    stepLines: DEMO_STEPS,
    sourceUrl: DEMO_SOURCE_URL,
  })

  return {
    ...recipe,
    description: 'Crispy-skinned roast chicken thighs with garlic, smoked paprika, and lemon.',
    servings: 4,
    servingsText: '4 servings',
    prepTimeMinutes: 10,
    cookTimeMinutes: 35,
    totalTimeMinutes: 45,
  }
}
