export interface RecipeNutrition {
  perServing: {
    calories: number
    protein: number // grams
    fat: number // grams
    carbs: number // grams
    fiber: number // grams
  }
  confidence: 'high' | 'medium' | 'low'
  computedAt: string // ISO timestamp
  ingredientCount: number // total ingredients
  matchedCount: number // ingredients successfully matched
}
