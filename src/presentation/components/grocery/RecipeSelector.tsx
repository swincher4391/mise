import { useState } from 'react'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { SelectedRecipe } from '@domain/models/GroceryList.ts'

interface RecipeSelectorProps {
  recipes: SavedRecipe[]
  onGenerate: (selected: SelectedRecipe[]) => void
}

interface RecipeSelection {
  selected: boolean
  servingOverride: number | null
}

export function RecipeSelector({ recipes, onGenerate }: RecipeSelectorProps) {
  const [selections, setSelections] = useState<Record<string, RecipeSelection>>({})

  const toggleRecipe = (id: string, servings: number | null) => {
    setSelections((prev) => {
      const current = prev[id]
      if (current?.selected) {
        const { [id]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: { selected: true, servingOverride: servings } }
    })
  }

  const updateServings = (id: string, value: number) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], servingOverride: value > 0 ? value : null },
    }))
  }

  const selectedCount = Object.values(selections).filter((s) => s.selected).length

  const handleGenerate = () => {
    const selected: SelectedRecipe[] = Object.entries(selections)
      .filter(([, s]) => s.selected)
      .map(([recipeId, s]) => ({ recipeId, servingOverride: s.servingOverride }))
    onGenerate(selected)
  }

  if (recipes.length === 0) {
    return (
      <div className="grocery-empty">
        <p>No saved recipes yet.</p>
        <p>Save some recipes to your library first, then come back to build a grocery list.</p>
      </div>
    )
  }

  return (
    <div className="recipe-selector">
      <p className="recipe-selector-hint">
        Select recipes to include in your grocery list:
      </p>
      <div className="recipe-selector-list">
        {recipes.map((recipe) => {
          const sel = selections[recipe.id]
          const isSelected = sel?.selected ?? false

          return (
            <div
              key={recipe.id}
              className={`recipe-selector-item ${isSelected ? 'selected' : ''}`}
            >
              <label className="recipe-selector-label">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRecipe(recipe.id, recipe.servings)}
                />
                <span className="recipe-selector-title">{recipe.title}</span>
                <span className="recipe-selector-meta">
                  {recipe.ingredients.length} ingredients
                </span>
              </label>
              {isSelected && (
                <div className="recipe-selector-servings">
                  <label>
                    Servings:
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={sel.servingOverride ?? recipe.servings ?? ''}
                      onChange={(e) => updateServings(recipe.id, parseInt(e.target.value, 10))}
                      className="serving-input"
                    />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button
        className="save-btn generate-btn"
        disabled={selectedCount === 0}
        onClick={handleGenerate}
      >
        Generate List ({selectedCount} recipe{selectedCount !== 1 ? 's' : ''})
      </button>
    </div>
  )
}
