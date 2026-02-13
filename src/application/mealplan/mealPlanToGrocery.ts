import type { PlannedMeal } from '@domain/models/MealPlan.ts'
import type { SelectedRecipe } from '@domain/models/GroceryList.ts'

/**
 * Convert planned meals into SelectedRecipe[] for aggregateIngredients().
 * Each meal occurrence becomes a separate SelectedRecipe entry so that
 * aggregateIngredients() correctly sums quantities when the same recipe
 * appears multiple times in the week.
 */
export function mealPlanToSelectedRecipes(meals: PlannedMeal[]): SelectedRecipe[] {
  return meals.map((meal) => ({
    recipeId: meal.recipeId,
    servingOverride: meal.servingOverride,
  }))
}
