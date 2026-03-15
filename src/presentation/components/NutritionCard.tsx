import { useState, useEffect, useRef } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'
import { estimateNutrition } from '@application/nutrition/estimateNutrition.ts'
import { getCachedNutrition, setCachedNutrition } from '@infrastructure/db/nutritionCacheRepository.ts'

interface NutritionCardProps {
  recipe: Recipe | SavedRecipe
  onComputed?: (nutrition: RecipeNutrition) => void
}

function isSaved(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

/** Fingerprint ingredients so we can detect edits. */
function ingredientFingerprint(recipe: Recipe | SavedRecipe): string {
  return recipe.ingredients.map((i) => i.raw).join('\n')
}

export function NutritionCard({ recipe, onComputed }: NutritionCardProps) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const lastFingerprint = useRef('')

  useEffect(() => {
    if (recipe.ingredients.length === 0) return

    const fingerprint = ingredientFingerprint(recipe)
    const ingredientsChanged = fingerprint !== lastFingerprint.current
    lastFingerprint.current = fingerprint

    let cancelled = false
    setLoading(true)

    async function load() {
      // Check cache if ingredients haven't changed
      if (!ingredientsChanged && isSaved(recipe)) {
        const cached = await getCachedNutrition(recipe.id)
        if (cached && !cancelled) {
          setNutrition(cached)
          setLoading(false)
          onComputed?.(cached)
          return
        }
      }

      // Estimate from current ingredients
      const result = await estimateNutrition(recipe)
      if (cancelled) return
      setNutrition(result)
      setLoading(false)

      if (result) {
        onComputed?.(result)
        // Cache the result
        if (isSaved(recipe)) {
          setCachedNutrition(recipe.id, result).catch(() => {})
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [recipe])

  if (loading) {
    return (
      <div className="nutrition-card nutrition-loading">
        <span className="nutrition-title">Estimating nutrition...</span>
      </div>
    )
  }

  if (!nutrition) return null

  const { perServing, confidence, ingredientCount, matchedCount } = nutrition

  return (
    <div className="nutrition-card">
      <button
        className="nutrition-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="nutrition-title">Nutrition (est.)</span>
        <span className="nutrition-summary">
          ~{perServing.calories} cal · {perServing.protein}g protein
        </span>
        <span className="nutrition-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="nutrition-card-body">
          <div className="nutrition-macros">
            <MacroItem label="Calories" value={perServing.calories} />
            <MacroItem label="Protein" value={perServing.protein} unit="g" />
            <MacroItem label="Fat" value={perServing.fat} unit="g" />
            <MacroItem label="Carbs" value={perServing.carbs} unit="g" />
            <MacroItem label="Fiber" value={perServing.fiber} unit="g" />
          </div>
          <p className="nutrition-source">
            Per serving · estimated from USDA data ({matchedCount}/{ingredientCount} ingredients matched)
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
