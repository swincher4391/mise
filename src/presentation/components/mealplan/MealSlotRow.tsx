import type { MealSlot, PlannedMeal } from '@domain/models/MealPlan.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

interface MealSlotRowProps {
  slot: MealSlot
  meal: PlannedMeal | undefined
  recipes: SavedRecipe[]
  onAdd: () => void
  onRemove: (mealId: string) => void
}

export function MealSlotRow({ slot, meal, recipes, onAdd, onRemove }: MealSlotRowProps) {
  const recipe = meal ? recipes.find((r) => r.id === meal.recipeId) : null

  return (
    <div className="meal-slot-row">
      <span className="meal-slot-label">{SLOT_LABELS[slot]}</span>
      {meal ? (
        <div className="meal-slot-filled">
          <span className="meal-slot-recipe">
            {recipe ? recipe.title : 'Recipe removed'}
          </span>
          <button
            className="meal-slot-remove"
            onClick={() => onRemove(meal.id)}
            aria-label={`Remove ${SLOT_LABELS[slot]}`}
          >
            &times;
          </button>
        </div>
      ) : (
        <button className="meal-slot-add" onClick={onAdd}>
          + Add
        </button>
      )}
    </div>
  )
}
