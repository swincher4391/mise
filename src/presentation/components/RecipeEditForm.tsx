import { useState } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'

interface RecipeEditFormProps {
  recipe: Recipe
  onApply: (recipe: Recipe) => void
  onCancel: () => void
}

export function RecipeEditForm({ recipe, onApply, onCancel }: RecipeEditFormProps) {
  const [title, setTitle] = useState(recipe.title)
  const [ingredients, setIngredients] = useState(
    recipe.ingredients.map((i) => i.raw).join('\n'),
  )
  const [steps, setSteps] = useState(
    recipe.steps.map((s) => s.text).join('\n'),
  )

  const canApply = title.trim() && ingredients.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canApply) return

    const parsed = createManualRecipe({
      title,
      ingredientLines: ingredients.split('\n'),
      stepLines: steps.split('\n'),
      sourceUrl: recipe.sourceUrl || undefined,
    })

    // Merge back metadata from the original recipe
    const edited: Recipe = {
      ...parsed,
      id: recipe.id,
      author: recipe.author,
      description: recipe.description,
      imageUrl: recipe.imageUrl,
      servings: recipe.servings,
      servingsText: recipe.servingsText,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
      nutrition: recipe.nutrition,
      keywords: recipe.keywords,
      cuisines: recipe.cuisines,
      categories: recipe.categories,
      extractedAt: recipe.extractedAt,
      extractionLayer: recipe.extractionLayer,
      parserVersion: recipe.parserVersion,
      schemaVersion: recipe.schemaVersion,
    }

    onApply(edited)
  }

  return (
    <form className="manual-entry-form" onSubmit={handleSubmit}>
      <label className="form-label">
        Title *
        <input
          className="form-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Recipe name"
          required
        />
      </label>

      <label className="form-label">
        Ingredients * <span className="form-hint">(one per line)</span>
        <textarea
          className="form-textarea"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={"2 cups flour\n1 tsp salt\n3 eggs"}
          rows={8}
          required
        />
      </label>

      <label className="form-label">
        Steps <span className="form-hint">(one per line)</span>
        <textarea
          className="form-textarea"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={"Mix dry ingredients\nAdd eggs and stir\nBake at 350F for 30 min"}
          rows={8}
        />
      </label>

      <div className="form-actions">
        <button type="submit" className="save-btn" disabled={!canApply}>
          Apply
        </button>
        <button type="button" className="nav-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
