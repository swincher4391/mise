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

type SortKey = 'ingredient' | 'cal' | 'prot' | 'fat' | 'carbs' | 'fiber' | 'net'

export function NutritionCard({ recipe, currentServings, purchase }: NutritionCardProps) {
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
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
            <IngredientTable
              perIngredient={perIngredient}
              displayServings={displayServings}
              sortKey={sortKey}
              sortDesc={sortDesc}
              onSort={(key) => {
                if (sortKey === key) {
                  setSortDesc(!sortDesc)
                } else {
                  setSortKey(key)
                  setSortDesc(true)
                }
              }}
            />
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

interface PerIngredientItem {
  ingredient: string
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  fiber: number | null
  matched: boolean
}

interface IngredientTableProps {
  perIngredient: PerIngredientItem[]
  displayServings: number
  sortKey: SortKey | null
  sortDesc: boolean
  onSort: (key: SortKey) => void
}

function IngredientTable({ perIngredient, displayServings, sortKey, sortDesc, onSort }: IngredientTableProps) {
  const s = displayServings

  const rows = useMemo(() => {
    const mapped = perIngredient.map((item, i) => {
      const cal = item.calories !== null ? Math.round(item.calories / s) : null
      const prot = item.protein !== null ? Math.round(item.protein / s * 10) / 10 : null
      const fat = item.fat !== null ? Math.round(item.fat / s * 10) / 10 : null
      const carbs = item.carbs !== null ? Math.round(item.carbs / s * 10) / 10 : null
      const fiber = item.fiber !== null ? Math.round(item.fiber / s * 10) / 10 : null
      const net = carbs !== null && fiber !== null ? Math.round((carbs - fiber) * 10) / 10 : null
      return { ...item, idx: i, cal, prot, fat, carbs, fiber, net }
    })

    if (!sortKey) return mapped

    return [...mapped].sort((a, b) => {
      if (sortKey === 'ingredient') {
        const cmp = a.ingredient.localeCompare(b.ingredient)
        return sortDesc ? -cmp : cmp
      }
      const av = a[sortKey] ?? -1
      const bv = b[sortKey] ?? -1
      return sortDesc ? bv - av : av - bv
    })
  }, [perIngredient, s, sortKey, sortDesc])

  const columns: { key: SortKey; label: string }[] = [
    { key: 'ingredient', label: 'Ingredient' },
    { key: 'cal', label: 'Cal' },
    { key: 'prot', label: 'Prot' },
    { key: 'fat', label: 'Fat' },
    { key: 'carbs', label: 'Carbs' },
    { key: 'fiber', label: 'Fiber' },
    { key: 'net', label: 'Net' },
  ]

  return (
    <table className="nutrition-breakdown">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`nb-sortable ${sortKey === col.key ? 'nb-sorted' : ''}`}
              onClick={() => onSort(col.key)}
            >
              {col.label}
              {sortKey === col.key && (
                <span className="nb-sort-arrow">{sortDesc ? ' \u25BC' : ' \u25B2'}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.idx} className={!row.matched ? 'nb-unmatched' : row.calories === 0 ? 'nb-zero' : ''}>
            <td className="nb-ingredient">{row.ingredient}</td>
            <td>{row.matched ? row.cal : '–'}</td>
            <td>{row.matched ? `${row.prot}g` : '–'}</td>
            <td>{row.matched ? `${row.fat}g` : '–'}</td>
            <td>{row.matched ? `${row.carbs}g` : '–'}</td>
            <td>{row.matched ? `${row.fiber}g` : '–'}</td>
            <td>{row.matched ? `${row.net}g` : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
