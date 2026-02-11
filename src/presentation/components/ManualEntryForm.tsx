import { useState } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'

interface ManualEntryFormProps {
  onSave: (recipe: Recipe) => Promise<void>
  onCancel: () => void
}

export function ManualEntryForm({ onSave, onCancel }: ManualEntryFormProps) {
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = title.trim() && ingredients.trim() && !saving

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    try {
      const recipe = createManualRecipe({
        title,
        ingredientLines: ingredients.split('\n'),
        stepLines: steps.split('\n'),
        sourceUrl: sourceUrl.trim() || undefined,
      })
      await onSave(recipe)
    } finally {
      setSaving(false)
    }
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
          rows={6}
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
          rows={6}
        />
      </label>

      <label className="form-label">
        Source URL <span className="form-hint">(optional)</span>
        <input
          className="form-input"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
        />
      </label>

      <div className="form-actions">
        <button type="submit" className="save-btn" disabled={!canSubmit}>
          {saving ? 'Saving...' : 'Save Recipe'}
        </button>
        <button type="button" className="nav-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
