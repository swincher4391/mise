import { useState, useEffect, useRef, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'
import { estimateNutrition } from '@application/nutrition/estimateNutrition.ts'
import { getCachedNutrition, setCachedNutrition } from '@infrastructure/db/nutritionCacheRepository.ts'

interface NutritionCardProps {
  recipe: Recipe | SavedRecipe
  currentServings?: number
}

function isSaved(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

function ingredientFingerprint(recipe: Recipe | SavedRecipe): string {
  return recipe.ingredients.map((i) => i.raw).join('\n')
}

export function NutritionCard({ recipe, currentServings }: NutritionCardProps) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const lastFingerprint = useRef('')

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
                {perIngredient.map((item, i) => (
                  <tr key={i} className={!item.matched ? 'nb-unmatched' : item.calories === 0 ? 'nb-zero' : ''}>
                    <td className="nb-ingredient">{item.ingredient}</td>
                    <td>{item.matched ? item.calories : '–'}</td>
                    <td>{item.matched ? `${item.protein}g` : '–'}</td>
                    <td>{item.matched ? `${item.fat}g` : '–'}</td>
                    <td>{item.matched ? `${item.carbs}g` : '–'}</td>
                    <td>{item.matched ? `${item.fiber}g` : '–'}</td>
                    <td>{item.matched ? `${Math.round(((item.carbs ?? 0) - (item.fiber ?? 0)) * 10) / 10}g` : '–'}</td>
                  </tr>
                ))}
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
