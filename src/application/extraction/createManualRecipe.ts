import type { Recipe } from '@domain/models/Recipe.ts'
import type { Step } from '@domain/models/Step.ts'
import { parseIngredients } from '@application/parser/IngredientParser.ts'

const PARSER_VERSION = '1.0.0'
const SCHEMA_VERSION = 1

function generateId(): string {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

interface ManualRecipeInput {
  title: string
  ingredientLines: string[]
  stepLines: string[]
  sourceUrl?: string
}

export function createManualRecipe(input: ManualRecipeInput): Recipe {
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

  return {
    id: generateId(),
    title: input.title.trim(),
    sourceUrl: input.sourceUrl ?? '',
    sourceDomain: input.sourceUrl ? extractDomain(input.sourceUrl) : '',
    author: null,
    description: null,
    imageUrl: null,
    servings: null,
    servingsText: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
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
    extractionLayer: 'manual',
    parserVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
  }
}
