import type { MealPlan, PlannedMeal, DayOfWeek, MealSlot } from '@domain/models/MealPlan.ts'
import { db } from './database.ts'

export async function getMealPlanByWeek(weekStart: string): Promise<MealPlan | undefined> {
  return db.mealPlans.where('weekStart').equals(weekStart).first()
}

export async function saveMealPlan(plan: MealPlan): Promise<void> {
  await db.mealPlans.put({ ...plan, updatedAt: new Date().toISOString() })
}

export async function addMealToPlan(
  weekStart: string,
  day: DayOfWeek,
  slot: MealSlot,
  recipeId: string,
): Promise<void> {
  let plan = await getMealPlanByWeek(weekStart)

  const meal: PlannedMeal = {
    id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    day,
    slot,
    recipeId,
    servingOverride: null,
  }

  if (!plan) {
    const now = new Date().toISOString()
    plan = {
      id: `mp-${Date.now()}`,
      weekStart,
      meals: [meal],
      createdAt: now,
      updatedAt: now,
    }
  } else {
    // Remove any existing meal in this slot
    plan.meals = plan.meals.filter((m) => !(m.day === day && m.slot === slot))
    plan.meals.push(meal)
  }

  await saveMealPlan(plan)
}

export async function removeMealFromPlan(
  weekStart: string,
  mealId: string,
): Promise<void> {
  const plan = await getMealPlanByWeek(weekStart)
  if (!plan) return

  plan.meals = plan.meals.filter((m) => m.id !== mealId)
  await saveMealPlan(plan)
}

export async function updateMealServings(
  weekStart: string,
  mealId: string,
  servingOverride: number | null,
): Promise<void> {
  const plan = await getMealPlanByWeek(weekStart)
  if (!plan) return

  const meal = plan.meals.find((m) => m.id === mealId)
  if (meal) {
    meal.servingOverride = servingOverride
    await saveMealPlan(plan)
  }
}
