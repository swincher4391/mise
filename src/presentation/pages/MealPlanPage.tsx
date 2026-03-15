import { useState, useCallback } from 'react'
import type { DayOfWeek, MealSlot } from '@domain/models/MealPlan.ts'
import { useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import { useMealPlan } from '@presentation/hooks/useMealPlan.ts'
import { getWeekStart, offsetWeek, formatWeekRange, formatWeekName, DAYS_OF_WEEK } from '@application/mealplan/weekUtils.ts'
import { mealPlanToSelectedRecipes } from '@application/mealplan/mealPlanToGrocery.ts'
import { aggregateIngredients } from '@application/grocery/aggregateIngredients.ts'
import { addMealToPlan, removeMealFromPlan } from '@infrastructure/db/mealPlanRepository.ts'
import { saveGroceryList } from '@infrastructure/db/groceryRepository.ts'
import type { GroceryList } from '@domain/models/GroceryList.ts'
import { trackEvent } from '@infrastructure/analytics/track.ts'
import { MealPlanDaySection } from '@presentation/components/mealplan/MealPlanDaySection.tsx'
import { RecipePickerModal } from '@presentation/components/mealplan/RecipePickerModal.tsx'
import { computeDayNutrition, formatNutritionForTare, getTodayDayOfWeek } from '@application/mealplan/dailyNutrition.ts'

interface MealPlanPageProps {
  onNavigateToGrocery: () => void
}

export function MealPlanPage({ onNavigateToGrocery }: MealPlanPageProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const plan = useMealPlan(weekStart)
  const { recipes } = useSavedRecipes()

  const [pickerTarget, setPickerTarget] = useState<{ day: DayOfWeek; slot: MealSlot } | null>(null)
  const [nutritionCopied, setNutritionCopied] = useState(false)

  const meals = plan?.meals ?? []
  const mealCount = meals.length

  // Check if current week and compute today's nutrition
  const currentWeekStart = getWeekStart()
  const isCurrentWeek = weekStart === currentWeekStart
  const todayNutrition = isCurrentWeek
    ? computeDayNutrition(getTodayDayOfWeek(), meals, recipes)
    : null

  const handlePrevWeek = useCallback(() => {
    setWeekStart((ws) => offsetWeek(ws, -1))
  }, [])

  const handleNextWeek = useCallback(() => {
    setWeekStart((ws) => offsetWeek(ws, 1))
  }, [])

  const handleAddMeal = useCallback((day: DayOfWeek, slot: MealSlot) => {
    setPickerTarget({ day, slot })
  }, [])

  const handleRemoveMeal = useCallback(async (mealId: string) => {
    await removeMealFromPlan(weekStart, mealId)
  }, [weekStart])

  const handlePickRecipe = useCallback(async (recipeId: string) => {
    if (!pickerTarget) return
    await addMealToPlan(weekStart, pickerTarget.day, pickerTarget.slot, recipeId)
    trackEvent('meal_added', { day: pickerTarget.day, slot: pickerTarget.slot })
    setPickerTarget(null)
  }, [weekStart, pickerTarget])

  const handleShopThisWeek = useCallback(async () => {
    if (mealCount === 0) return

    const selected = mealPlanToSelectedRecipes(meals)
    const items = aggregateIngredients(recipes, selected)

    const now = new Date().toISOString()
    const list: GroceryList = {
      id: `gl-${Date.now()}`,
      name: formatWeekName(weekStart),
      selectedRecipes: selected,
      items,
      manualItems: [],
      createdAt: now,
      updatedAt: now,
    }

    await saveGroceryList(list)
    onNavigateToGrocery()
  }, [meals, mealCount, recipes, weekStart, onNavigateToGrocery])

  return (
    <main className="extract-page">
      <div className="page-header">
        <h1 className="app-title">Mise</h1>
        <p className="app-tagline">Meal Plan</p>
      </div>

      <div className="meal-plan-week-nav">
        <button className="meal-plan-arrow" onClick={handlePrevWeek} aria-label="Previous week">
          &lsaquo;
        </button>
        <span className="meal-plan-week-label">{formatWeekRange(weekStart)}</span>
        <button className="meal-plan-arrow" onClick={handleNextWeek} aria-label="Next week">
          &rsaquo;
        </button>
      </div>

      <div className="meal-plan-actions">
        <button
          className="shop-week-btn save-btn"
          onClick={handleShopThisWeek}
          disabled={mealCount === 0}
        >
          Shop This Week ({mealCount} {mealCount === 1 ? 'meal' : 'meals'})
        </button>

        {todayNutrition && (
          <button
            className="copy-nutrition-btn"
            onClick={() => {
              navigator.clipboard.writeText(formatNutritionForTare(todayNutrition))
              setNutritionCopied(true)
              setTimeout(() => setNutritionCopied(false), 2000)
            }}
          >
            {nutritionCopied ? 'Copied!' : `Copy Today's Nutrition`}
            {!nutritionCopied && todayNutrition.mealsWithNutrition < todayNutrition.mealCount && (
              <span className="nutrition-partial"> ({todayNutrition.mealsWithNutrition}/{todayNutrition.mealCount})</span>
            )}
          </button>
        )}
      </div>

      {DAYS_OF_WEEK.map((day) => (
        <MealPlanDaySection
          key={day}
          day={day}
          meals={meals}
          recipes={recipes}
          onAddMeal={handleAddMeal}
          onRemoveMeal={handleRemoveMeal}
        />
      ))}

      {pickerTarget && (
        <RecipePickerModal
          recipes={recipes}
          onPick={handlePickRecipe}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </main>
  )
}
