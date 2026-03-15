export interface NormalizedIngredient {
  raw: string
  name: string
  action: 'MATCH' | 'SKIP' | 'ESTIMATE_QUANTITY'
  defaultGrams?: number
}

export interface IngredientNutrition {
  ingredient: string
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  fiber: number | null
  matched: boolean
}

export interface RecipeNutrition {
  perServing: {
    calories: number
    protein: number // grams
    fat: number // grams
    carbs: number // grams
    fiber: number // grams
  }
  perIngredient: IngredientNutrition[]
  confidence: 'high' | 'medium' | 'low'
  computedAt: string // ISO timestamp
  ingredientCount: number // total ingredients
  matchedCount: number // ingredients successfully matched
  normalizedNames?: Record<string, string> // raw ingredient → normalized name
}
