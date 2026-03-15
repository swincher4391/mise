export interface IngredientNutrition {
  ingredient: string
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
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
}
