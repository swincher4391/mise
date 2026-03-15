import { useState, useEffect } from 'react'
import type { DayOfWeek, MealSlot, PlannedMeal } from '@domain/models/MealPlan.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { DAY_LABELS } from '@application/mealplan/weekUtils.ts'
import { estimateNutrition } from '@application/nutrition/estimateNutrition.ts'
import { getCachedNutrition, setCachedNutrition } from '@infrastructure/db/nutritionCacheRepository.ts'
import { MealSlotRow } from './MealSlotRow.tsx'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

interface MealPlanDaySectionProps {
  day: DayOfWeek
  meals: PlannedMeal[]
  recipes: SavedRecipe[]
  onAddMeal: (day: DayOfWeek, slot: MealSlot) => void
  onRemoveMeal: (mealId: string) => void
}

interface DailyTotals {
  calories: number
  protein: number
  fat: number
  carbs: number
}

export function MealPlanDaySection({ day, meals, recipes, onAddMeal, onRemoveMeal }: MealPlanDaySectionProps) {
  const [dailyTotals, setDailyTotals] = useState<DailyTotals | null>(null)
  const dayMeals = meals.filter((m) => m.day === day)

  useEffect(() => {
    let cancelled = false

    async function computeTotals() {
      let calories = 0
      let protein = 0
      let fat = 0
      let carbs = 0
      let hasData = false

      for (const meal of dayMeals) {
        const recipe = recipes.find((r) => r.id === meal.recipeId)
        if (!recipe) continue

        // Prefer JSON-LD nutrition from source
        if (recipe.nutrition && recipe.nutrition.calories != null) {
          hasData = true
          calories += recipe.nutrition.calories ?? 0
          protein += recipe.nutrition.proteinG ?? 0
          fat += recipe.nutrition.fatG ?? 0
          carbs += recipe.nutrition.carbohydrateG ?? 0
          continue
        }

        // Check nutrition cache, estimate if missing
        let cached = await getCachedNutrition(recipe.id)
        if (!cached) {
          const estimated = await estimateNutrition(recipe)
          if (estimated) {
            await setCachedNutrition(recipe.id, estimated).catch(() => {})
            cached = estimated
          }
        }

        if (cached) {
          hasData = true
          calories += cached.perServing.calories
          protein += cached.perServing.protein
          fat += cached.perServing.fat
          carbs += cached.perServing.carbs
        }
      }

      if (!cancelled) {
        setDailyTotals(hasData
          ? { calories: Math.round(calories), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) }
          : null)
      }
    }

    if (dayMeals.length > 0) {
      computeTotals()
    } else {
      setDailyTotals(null)
    }

    return () => { cancelled = true }
  }, [dayMeals, recipes])

  return (
    <div className="meal-plan-day">
      <h3 className="meal-plan-day-label">{DAY_LABELS[day]}</h3>
      {SLOTS.map((slot) => {
        const meal = meals.find((m) => m.day === day && m.slot === slot)
        return (
          <MealSlotRow
            key={slot}
            slot={slot}
            meal={meal}
            recipes={recipes}
            onAdd={() => onAddMeal(day, slot)}
            onRemove={onRemoveMeal}
          />
        )
      })}
      {dailyTotals && (
        <div className="meal-plan-day-totals">
          ~{dailyTotals.calories} cal · {dailyTotals.protein}g protein · {dailyTotals.fat}g fat · {dailyTotals.carbs}g carbs
        </div>
      )}
    </div>
  )
}
