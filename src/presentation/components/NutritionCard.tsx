import { useState, useEffect, useRef, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'
import { estimateNutrition } from '@application/nutrition/estimateNutrition.ts'
import { getCachedNutrition, setCachedNutrition } from '@infrastructure/db/nutritionCacheRepository.ts'
import type { PurchaseState } from '@presentation/hooks/usePurchase.ts'

interface NutritionCardProps {
  recipe: Recipe | SavedRecipe
  currentServings?: number
  purchase?: PurchaseState
}

function isSaved(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

function ingredientFingerprint(recipe: Recipe | SavedRecipe): string {
  return recipe.ingredients.map((i) => i.raw).join('\n')
}

export function NutritionCard({ recipe, currentServings, purchase }: NutritionCardProps) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const lastFingerprint = useRef('')

  // Source nutrition from JSON-LD is always free to display
  const hasSourceNutrition = recipe.nutrition !== null

  // Estimated nutrition is gated for free users (but normalization still runs for Instacart)
  const isPaid = purchase?.isPaid ?? true // default to true if no purchase context (e.g. unsaved recipe preview)
  const showEstimatedNutrition = isPaid || hasSourceNutrition

  // The cached nutrition is computed for the recipe's original servings.
  // If the user scales servings, we adjust at display time.
  const originalServings = recipe.servings ?? 1
  const displayServings = currentServings ?? originalServings
  const servingRatio = originalServings / displayServings

  useEffect(() => {
    if (recipe.ingredients.length === 0) return

    const fingerprint = ingredientFingerprint(recipe)
    const ingredientsChanged = fingerprint !== lastFingerprint.current
    lastFingerprint.current = fingerprint

    let cancelled = false
    setLoading(true)

    async function load() {
      if (!ingredientsChanged && isSaved(recipe)) {
        const cached = await getCachedNutrition(recipe.id)
        if (cached && !cancelled) {
          setNutrition(cached)
          setLoading(false)
          return
        }
      }

      // Always run estimation (includes normalization for Instacart cache)
      const result = await estimateNutrition(recipe)
      if (cancelled) return
      setNutrition(result)
      setLoading(false)

      if (result && isSaved(recipe)) {
        setCachedNutrition(recipe.id, result).catch(() => {})
      }
    }

    load()
    return () => { cancelled = true }
  }, [recipe])

  // Adjust per-serving values for current serving count
  const adjusted = useMemo(() => {
    if (!nutrition) return null
    const r = servingRatio
    return {
      calories: Math.round(nutrition.perServing.calories * r),
      protein: Math.round(nutrition.perServing.protein * r * 10) / 10,
      fat: Math.round(nutrition.perServing.fat * r * 10) / 10,
      carbs: Math.round(nutrition.perServing.carbs * r * 10) / 10,
      fiber: Math.round(nutrition.perServing.fiber * r * 10) / 10,
    }
  }, [nutrition, servingRatio])

  if (loading) {
    return (
      <div className="nutrition-card nutrition-loading">
        <span className="nutrition-title">Estimating nutrition...</span>
      </div>
    )
  }

  if (!nutrition || !adjusted) return null

  // Free user with no source nutrition: show upgrade teaser
  if (!showEstimatedNutrition) {
    return (
      <div className="nutrition-card nutrition-gated">
        <div className="nutrition-card-header">
          <span className="nutrition-title">Nutrition (est.)</span>
          <span className="nutrition-summary nutrition-locked">Upgrade for nutrition estimates</span>
        </div>
      </div>
    )
  }

  const { confidence, ingredientCount, matchedCount, perIngredient } = nutrition

  return (
    <div className="nutrition-card">
      <button
        className="nutrition-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="nutrition-title">Nutrition (est.)</span>
        <span className="nutrition-summary">
          ~{adjusted.calories} cal · {adjusted.protein}g protein
        </span>
        <span className="nutrition-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="nutrition-card-body">
          <div className="nutrition-macros">
            <MacroItem label="Calories" value={adjusted.calories} />
            <MacroItem label="Protein" value={adjusted.protein} unit="g" />
            <MacroItem label="Fat" value={adjusted.fat} unit="g" />
            <MacroItem label="Carbs" value={adjusted.carbs} unit="g" />
            <MacroItem label="Fiber" value={adjusted.fiber} unit="g" />
            <MacroItem label="Net Carbs" value={Math.round((adjusted.carbs - adjusted.fiber) * 10) / 10} unit="g" />
          </div>

          {perIngredient.length > 0 && (
            <table className="nutrition-breakdown">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Cal</th>
                  <th>Prot</th>
                  <th>Fat</th>
                  <th>Carbs</th>
                  <th>Fiber</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {perIngredient.map((item, i) => {
                  const s = displayServings
                  const cal = item.calories !== null ? Math.round(item.calories / s) : null
                  const prot = item.protein !== null ? Math.round(item.protein / s * 10) / 10 : null
                  const fat = item.fat !== null ? Math.round(item.fat / s * 10) / 10 : null
                  const carbs = item.carbs !== null ? Math.round(item.carbs / s * 10) / 10 : null
                  const fiber = item.fiber !== null ? Math.round(item.fiber / s * 10) / 10 : null
                  const net = carbs !== null && fiber !== null ? Math.round((carbs - fiber) * 10) / 10 : null
                  return (
                  <tr key={i} className={!item.matched ? 'nb-unmatched' : item.calories === 0 ? 'nb-zero' : ''}>
                    <td className="nb-ingredient">{item.ingredient}</td>
                    <td>{item.matched ? cal : '–'}</td>
                    <td>{item.matched ? `${prot}g` : '–'}</td>
                    <td>{item.matched ? `${fat}g` : '–'}</td>
                    <td>{item.matched ? `${carbs}g` : '–'}</td>
                    <td>{item.matched ? `${fiber}g` : '–'}</td>
                    <td>{item.matched ? `${net}g` : '–'}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <p className="nutrition-source">
            Per serving ({displayServings}) · estimated from USDA data ({matchedCount}/{ingredientCount} matched)
            {confidence === 'low' && ' · low confidence'}
          </p>
        </div>
      )}
    </div>
  )
}

function MacroItem({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="macro-item">
      <span className="macro-value">~{value}{unit}</span>
      <span className="macro-label">{label}</span>
    </div>
  )
}
