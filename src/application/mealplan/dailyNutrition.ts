import type { DayOfWeek, PlannedMeal } from '@domain/models/MealPlan.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'

export interface DailyNutritionTotal {
  calories: number
  protein: number
  fat: number
  carbs: number
  mealCount: number
  mealsWithNutrition: number
}

/**
 * Compute total nutrition for a given day from planned meals.
 * Uses cached estimated nutrition if available, falls back to JSON-LD nutrition.
 * Accepts a pre-loaded nutrition cache map to avoid async lookups.
 * Returns null if no meals have nutrition data.
 */
export function computeDayNutrition(
  day: DayOfWeek,
  meals: PlannedMeal[],
  recipes: SavedRecipe[],
  nutritionCache?: Map<string, RecipeNutrition>
): DailyNutritionTotal | null {
  const dayMeals = meals.filter((m) => m.day === day)
  if (dayMeals.length === 0) return null

  const recipeMap = new Map(recipes.map((r) => [r.id, r]))

  let calories = 0
  let protein = 0
  let fat = 0
  let carbs = 0
  let mealsWithNutrition = 0

  for (const meal of dayMeals) {
    const recipe = recipeMap.get(meal.recipeId)
    if (!recipe) continue

    // Check cached estimated nutrition first, then JSON-LD
    const cached = nutritionCache?.get(recipe.id)
    const n = cached?.perServing ?? (recipe.nutrition ? {
      calories: recipe.nutrition.calories ?? 0,
      protein: recipe.nutrition.proteinG ?? 0,
      fat: recipe.nutrition.fatG ?? 0,
      carbs: recipe.nutrition.carbohydrateG ?? 0,
    } : null)

    if (!n) continue
    mealsWithNutrition++
    const servings = meal.servingOverride ?? 1
    calories += (n.calories ?? 0) * servings
    protein += (n.protein ?? 0) * servings
    fat += (n.fat ?? 0) * servings
    carbs += (n.carbs ?? 0) * servings
  }

  if (mealsWithNutrition === 0) return null

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    mealCount: dayMeals.length,
    mealsWithNutrition,
  }
}

/**
 * Format nutrition totals as a Tare-compatible clipboard string.
 */
export function formatNutritionForTare(totals: DailyNutritionTotal): string {
  return `mise:${totals.calories}cal|${totals.protein}p|${totals.fat}f|${totals.carbs}c|${totals.mealCount}meals`
}

/**
 * Get today's DayOfWeek.
 */
export function getTodayDayOfWeek(): DayOfWeek {
  const jsDay = new Date().getDay() // 0=Sun
  const map: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return map[jsDay]
}
