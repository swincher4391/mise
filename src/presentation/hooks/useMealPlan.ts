import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@infrastructure/db/database.ts'
import type { MealPlan } from '@domain/models/MealPlan.ts'

export function useMealPlan(weekStart: string): MealPlan | null {
  const plan = useLiveQuery(
    () => db.mealPlans.where('weekStart').equals(weekStart).first(),
    [weekStart],
  )

  return plan ?? null
}
