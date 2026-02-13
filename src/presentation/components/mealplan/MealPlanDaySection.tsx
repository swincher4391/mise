import type { DayOfWeek, MealSlot, PlannedMeal } from '@domain/models/MealPlan.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { DAY_LABELS } from '@application/mealplan/weekUtils.ts'
import { MealSlotRow } from './MealSlotRow.tsx'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

interface MealPlanDaySectionProps {
  day: DayOfWeek
  meals: PlannedMeal[]
  recipes: SavedRecipe[]
  onAddMeal: (day: DayOfWeek, slot: MealSlot) => void
  onRemoveMeal: (mealId: string) => void
}

export function MealPlanDaySection({ day, meals, recipes, onAddMeal, onRemoveMeal }: MealPlanDaySectionProps) {
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
    </div>
  )
}
