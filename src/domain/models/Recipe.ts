import type { Ingredient } from './Ingredient.ts'
import type { Step } from './Step.ts'
import type { Nutrition } from './Nutrition.ts'

export interface Recipe {
  id: string
  title: string
  sourceUrl: string
  sourceDomain: string
  author: string | null
  description: string | null
  imageUrl: string | null
  servings: number | null
  servingsText: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  totalTimeMinutes: number | null
  ingredients: Ingredient[]
  steps: Step[]
  nutrition: Nutrition | null
  keywords: string[]
  cuisines: string[]
  categories: string[]
  tags: string[]
  notes: string | null
  favorite: boolean
  extractedAt: string
  extractionLayer: 'json-ld' | 'microdata' | 'manual' | 'image'
  parserVersion: string
  schemaVersion: number
}
