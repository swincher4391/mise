import { useState, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { useIsRecipeSaved, useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import { downloadSingleRecipe } from '@application/export/exportRecipes.ts'
import { createRecipePage } from '@infrastructure/instacart/instacartApi.ts'
import { UpgradePrompt } from './UpgradePrompt.tsx'
import { RecipeHeader } from './RecipeHeader.tsx'
import { ServingScaler } from './ServingScaler.tsx'
import { IngredientList } from './IngredientList.tsx'
import { StepList } from './StepList.tsx'
import { TagManager } from './TagManager.tsx'
import { CookingMode } from './CookingMode.tsx'
import { RecipeEditForm } from './RecipeEditForm.tsx'
import { FREE_RECIPE_LIMIT, type PurchaseState } from '@presentation/hooks/usePurchase.ts'

interface RecipeDisplayProps {
  recipe: Recipe | SavedRecipe
  showSaveButton?: boolean
  onDelete?: () => void
  purchase?: PurchaseState
  onSaved?: () => void
}

function isSavedRecipe(recipe: Recipe | SavedRecipe): recipe is SavedRecipe {
  return 'savedAt' in recipe
}

export function RecipeDisplay({ recipe, showSaveButton, onDelete, purchase, onSaved }: RecipeDisplayProps) {
  const [currentServings, setCurrentServings] = useState(recipe.servings ?? 4)
  const isSaved = useIsRecipeSaved(recipe.sourceUrl)
  const { recipes, save, toggleFavorite, updateNotes, updateTags } = useSavedRecipes()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [cookingMode, setCookingMode] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editedRecipe, setEditedRecipe] = useState<Recipe | null>(null)
  const [instacartLoading, setInstacartLoading] = useState(false)

  const saved = isSavedRecipe(recipe) ? recipe : null
  const effective = editedRecipe ?? recipe

  const scaledIngredients = useMemo(
    () => scaleIngredients(effective.ingredients, effective.servings ?? currentServings, currentServings),
    [effective.ingredients, effective.servings, currentServings],
  )

  const isPhotoExtract = effective.extractionLayer === 'image'

  const handleSave = async () => {
    // Gate photo-extracted recipes behind paid tier
    if (purchase && !purchase.isPaid && isPhotoExtract) {
      setShowUpgrade(true)
      return
    }
    // Enforce free tier recipe limit
    if (purchase && !purchase.isPaid && recipes.length >= FREE_RECIPE_LIMIT) {
      setShowUpgrade(true)
      return
    }
    await save(effective)
    onSaved?.()
  }

  const handleShopInstacart = async () => {
    setInstacartLoading(true)
    try {
      const result = await createRecipePage(effective)
      window.open(result.url, '_blank', 'noopener')
    } catch (err) {
      console.error('Instacart error:', err)
      alert(err instanceof Error ? err.message : 'Failed to create Instacart recipe page')
    } finally {
      setInstacartLoading(false)
    }
  }

  const handleApplyEdit = (edited: Recipe) => {
    setEditedRecipe(edited)
    setEditMode(false)
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
  const hasSteps = effective.steps.length > 0

  if (cookingMode && hasSteps) {
    return (
      <CookingMode
        recipe={effective}
        scaledIngredients={scaledIngredients}
        onExit={() => setCookingMode(false)}
      />
    )
  }

  return (
    <article className="recipe-display">
      <RecipeHeader recipe={effective} />
      {showActions && (
        <div className="recipe-actions">
          {showSaveButton && !isSaved && !editMode && (
            <button className="nav-btn" onClick={() => setEditMode(true)}>
              Edit
            </button>
          )}
          {showSaveButton && (
            <button
              className={`save-btn ${isSaved ? 'saved' : ''}`}
              onClick={handleSave}
              disabled={isSaved || editMode}
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

      {editMode ? (
        <RecipeEditForm
          recipe={effective}
          onApply={handleApplyEdit}
          onCancel={() => setEditMode(false)}
        />
      ) : (
        <>
          {effective.servings && (
            <ServingScaler
              currentServings={currentServings}
              onChange={setCurrentServings}
            />
          )}
          <IngredientList ingredients={scaledIngredients} />
          {effective.ingredients.length > 0 && (
            <button
              className="nav-btn"
              onClick={handleShopInstacart}
              disabled={instacartLoading}
              style={{
                backgroundColor: '#003D29',
                color: '#FAF1E5',
                border: 'none',
                width: '100%',
                padding: '12px 18px',
                marginBottom: '1rem',
                fontSize: '0.95rem',
              }}
            >
              {instacartLoading ? 'Loading...' : 'Shop ingredients on Instacart'}
            </button>
          )}
          <StepList steps={effective.steps} />
        </>
      )}

      {showUpgrade && purchase && (
        <UpgradePrompt
          feature={
            isPhotoExtract
              ? 'Saving photo-imported recipes is a premium feature. Upgrade to keep this recipe and import unlimited photos.'
              : `You've saved ${FREE_RECIPE_LIMIT} recipes — the free tier limit. Upgrade to save unlimited recipes.`
          }
          onUpgrade={purchase.upgrade}
          onRestore={purchase.restore}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </article>
  )
}
