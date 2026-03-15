import { useState, useEffect } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { RecipeNutrition } from '@domain/models/RecipeNutrition.ts'
import { estimateNutrition } from '@application/nutrition/estimateNutrition.ts'
import { getCachedNutrition, setCachedNutrition } from '@infrastructure/db/nutritionCacheRepository.ts'

interface NutritionCardProps {
  recipe: Recipe | SavedRecipe
}

function isSaved(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

export function NutritionCard({ recipe }: NutritionCardProps) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // Prefer JSON-LD nutrition from source — don't estimate
    if (recipe.nutrition && recipe.nutrition.calories != null) return

    let cancelled = false
    setLoading(true)

    async function load() {
      // Check cache first
      if (isSaved(recipe)) {
        const cached = await getCachedNutrition(recipe.id)
        if (cached && !cancelled) {
          setNutrition(cached)
          setLoading(false)
          return
        }
      }

      // Estimate and cache
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

  // Show JSON-LD nutrition if available
  const jsonLd = recipe.nutrition
  if (jsonLd && jsonLd.calories != null) {
    return (
      <div className="nutrition-card">
        <button
          className="nutrition-card-header"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="nutrition-title">Nutrition</span>
          <span className="nutrition-summary">
            {jsonLd.calories} cal
            {jsonLd.proteinG != null && ` · ${jsonLd.proteinG}g protein`}
          </span>
          <span className="nutrition-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
        </button>
        {expanded && (
          <div className="nutrition-card-body">
            <div className="nutrition-macros">
              {jsonLd.calories != null && <MacroItem label="Calories" value={jsonLd.calories} />}
              {jsonLd.proteinG != null && <MacroItem label="Protein" value={jsonLd.proteinG} unit="g" />}
              {jsonLd.fatG != null && <MacroItem label="Fat" value={jsonLd.fatG} unit="g" />}
              {jsonLd.carbohydrateG != null && <MacroItem label="Carbs" value={jsonLd.carbohydrateG} unit="g" />}
              {jsonLd.fiberG != null && <MacroItem label="Fiber" value={jsonLd.fiberG} unit="g" />}
            </div>
            <p className="nutrition-source">Per serving · from recipe source</p>
          </div>
        )}
      </div>
    )
  }

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
            <MacroItem label="Calories" value={perServing.calories} approx />
            <MacroItem label="Protein" value={perServing.protein} unit="g" approx />
            <MacroItem label="Fat" value={perServing.fat} unit="g" approx />
            <MacroItem label="Carbs" value={perServing.carbs} unit="g" approx />
            <MacroItem label="Fiber" value={perServing.fiber} unit="g" approx />
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

function MacroItem({ label, value, unit, approx }: { label: string; value: number; unit?: string; approx?: boolean }) {
  return (
    <div className="macro-item">
      <span className="macro-value">{approx && '~'}{value}{unit}</span>
      <span className="macro-label">{label}</span>
    </div>
  )
}
