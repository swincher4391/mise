import type { DayOfWeek, MealSlot } from '@domain/models/MealPlan.ts'
import { DAYS_OF_WEEK } from '@application/mealplan/weekUtils.ts'
import { getWeekStart } from '@application/mealplan/weekUtils.ts'
import { addMealToPlan } from '@infrastructure/db/mealPlanRepository.ts'
import { trackEvent } from '@infrastructure/analytics/track.ts'

interface MealPlanPromptProps {
  recipeId: string
  onClose: () => void
}

const DAY_ABBREVS: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Bkfst',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

export function MealPlanPrompt({ recipeId, onClose }: MealPlanPromptProps) {
  const handleSlotClick = async (day: DayOfWeek, slot: MealSlot) => {
    const weekStart = getWeekStart()
    await addMealToPlan(weekStart, day, slot, recipeId)
    trackEvent('meal_plan_prompt_accepted', { day, slot })
    onClose()
  }

  const handleDismiss = () => {
    trackEvent('meal_plan_prompt_dismissed')
    onClose()
  }

  return (
    <div className="meal-plan-prompt-overlay" onClick={handleDismiss}>
      <div className="meal-plan-prompt" onClick={(e) => e.stopPropagation()}>
        <h3>Add to this week's meal plan?</h3>
        <p className="meal-plan-prompt-subtitle">Tap a slot to plan when you'll cook this</p>
        <div className="meal-plan-grid">
          <div className="meal-plan-slot-label" />
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="meal-plan-day-header">
              {DAY_ABBREVS[day]}
            </div>
          ))}
          {MEAL_SLOTS.map((slot) => (
            <>
              <div key={`label-${slot}`} className="meal-plan-slot-label">
                {SLOT_LABELS[slot]}
              </div>
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={`${day}-${slot}`}
                  className="meal-plan-slot"
                  onClick={() => handleSlotClick(day, slot)}
                  aria-label={`${DAY_ABBREVS[day]} ${slot}`}
                />
              ))}
            </>
          ))}
        </div>
        <button className="meal-plan-skip" onClick={handleDismiss}>
          Skip
        </button>
      </div>
    </div>
  )
}
