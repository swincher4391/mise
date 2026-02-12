import type { Recipe } from '@domain/models/Recipe.ts'
import type { Step } from '@domain/models/Step.ts'
import { parseIngredients } from '@application/parser/IngredientParser.ts'
import { parseInformalDuration } from '@application/import/parseInformalDuration.ts'

const PARSER_VERSION = '1.0.0'
const SCHEMA_VERSION = 1

function generateId(): string {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export interface ImageRecipeInput {
  title: string
  ingredientLines: string[]
  stepLines: string[]
  servings?: string | null
  prepTime?: string | null
  cookTime?: string | null
}

export function createImageRecipe(input: ImageRecipeInput): Recipe {
  const steps: Step[] = input.stepLines
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, i) => ({
      id: `step_${i + 1}`,
      order: i + 1,
      text,
      timerSeconds: null,
      ingredientRefs: [],
    }))

  const prepTimeMinutes = input.prepTime ? parseInformalDuration(input.prepTime) : null
  const cookTimeMinutes = input.cookTime ? parseInformalDuration(input.cookTime) : null
  const totalTimeMinutes =
    prepTimeMinutes != null || cookTimeMinutes != null
      ? (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0)
      : null

  const servings = input.servings ? parseInt(input.servings, 10) : null

  return {
    id: generateId(),
    title: input.title.trim(),
    sourceUrl: '',
    sourceDomain: '',
    author: null,
    description: null,
    imageUrl: null,
    servings: servings && !isNaN(servings) ? servings : null,
    servingsText: input.servings ?? null,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
    ingredients: parseIngredients(input.ingredientLines.filter((l) => l.trim())),
    steps,
    nutrition: null,
    keywords: [],
    cuisines: [],
    categories: [],
    tags: [],
    notes: null,
    favorite: false,
    extractedAt: new Date().toISOString(),
    extractionLayer: 'image',
    parserVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
  }
}
