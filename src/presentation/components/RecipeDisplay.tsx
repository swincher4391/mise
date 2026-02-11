import { useState, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { useIsRecipeSaved, useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import { downloadSingleRecipe } from '@application/export/exportRecipes.ts'
import { RecipeHeader } from './RecipeHeader.tsx'
import { ServingScaler } from './ServingScaler.tsx'
import { IngredientList } from './IngredientList.tsx'
import { StepList } from './StepList.tsx'
import { TagManager } from './TagManager.tsx'
import { CookingMode } from './CookingMode.tsx'

interface RecipeDisplayProps {
  recipe: Recipe | SavedRecipe
  showSaveButton?: boolean
  onDelete?: () => void
}

function isSavedRecipe(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

export function RecipeDisplay({ recipe, showSaveButton, onDelete }: RecipeDisplayProps) {
  const [currentServings, setCurrentServings] = useState(recipe.servings ?? 4)
  const isSaved = useIsRecipeSaved(recipe.sourceUrl)
  const { save, toggleFavorite, updateNotes, updateTags } = useSavedRecipes()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [cookingMode, setCookingMode] = useState(false)

  const saved = isSavedRecipe(recipe) ? recipe : null

  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, recipe.servings ?? currentServings, currentServings),
    [recipe.ingredients, recipe.servings, currentServings],
  )

  const handleSave = async () => {
    await save(recipe)
  }

  const handleStartEditNotes = () => {
    setNotesValue(saved?.notes ?? '')
    setEditingNotes(true)
  }

  const handleSaveNotes = async () => {
    if (!saved) return
    await updateNotes(saved.id, notesValue.trim() || null)
    setEditingNotes(false)
  }

  const handleCancelNotes = () => {
    setEditingNotes(false)
  }

  const showActions = showSaveButton || onDelete || saved
  const hasSteps = recipe.steps.length > 0

  if (cookingMode && hasSteps) {
    return (
      <CookingMode
        recipe={recipe}
        scaledIngredients={scaledIngredients}
        onExit={() => setCookingMode(false)}
      />
    )
  }

  return (
    <article className="recipe-display">
      <RecipeHeader recipe={recipe} />
      {showActions && (
        <div className="recipe-actions">
          {showSaveButton && (
            <button
              className={`save-btn ${isSaved ? 'saved' : ''}`}
              onClick={handleSave}
              disabled={isSaved}
            >
              {isSaved ? 'Saved' : 'Save Recipe'}
            </button>
          )}
          {saved && (
            <button
              className={`favorite-btn ${saved.favorite ? 'favorited' : ''}`}
              onClick={() => toggleFavorite(saved.id, saved.favorite)}
              aria-label={saved.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {saved.favorite ? '\u2605' : '\u2606'}
            </button>
          )}
          {saved && (
            <button className="nav-btn" onClick={() => downloadSingleRecipe(saved)}>
              Export
            </button>
          )}
          {onDelete && (
            <button className="delete-btn" onClick={onDelete}>
              Remove
            </button>
          )}
        </div>
      )}

      {saved && (
        <TagManager
          tags={saved.tags ?? []}
          onUpdate={(tags) => updateTags(saved.id, tags)}
        />
      )}

      {saved && (
        <div className="recipe-notes">
          {editingNotes ? (
            <>
              <textarea
                className="notes-textarea"
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add your notes..."
                rows={3}
                autoFocus
              />
              <div className="notes-actions">
                <button className="save-btn" onClick={handleSaveNotes}>Save</button>
                <button className="nav-btn" onClick={handleCancelNotes}>Cancel</button>
              </div>
            </>
          ) : (
            <button className="notes-display" onClick={handleStartEditNotes}>
              {saved.notes || 'Add notes...'}
            </button>
          )}
        </div>
      )}

      {hasSteps && (
        <button
          className="cook-mode-btn"
          onClick={() => setCookingMode(true)}
        >
          Start Cooking
        </button>
      )}

      {recipe.servings && (
        <ServingScaler
          currentServings={currentServings}
          onChange={setCurrentServings}
        />
      )}
      <IngredientList ingredients={scaledIngredients} />
      <StepList steps={recipe.steps} />
    </article>
  )
}
