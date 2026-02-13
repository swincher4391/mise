export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export interface PlannedMeal {
  id: string
  day: DayOfWeek
  slot: MealSlot
  recipeId: string
  servingOverride: number | null
}

export interface MealPlan {
  id: string
  weekStart: string          // ISO date of Monday (YYYY-MM-DD)
  meals: PlannedMeal[]
  createdAt: string
  updatedAt: string
}
