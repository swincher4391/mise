import { useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { useIsRecipeSaved, useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import { downloadSingleRecipe } from '@application/export/exportRecipes.ts'
import { shareRecipe } from '@application/share/shareRecipe.ts'
import { buildQrShareUrl } from '@application/share/compressRecipe.ts'
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
import { trackEvent } from '@infrastructure/analytics/track.ts'

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
  const { recipes, save, toggleFavorite, updateNotes, updateTags, updateRecipe } = useSavedRecipes()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [cookingMode, setCookingMode] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editedRecipe, setEditedRecipe] = useState<Recipe | null>(null)
  const [instacartLoading, setInstacartLoading] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [qrModal, setQrModal] = useState<{ url: string } | 'too-large' | null>(null)

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
    trackEvent('recipe_saved', {
      source_domain: effective.sourceUrl ? (() => { try { return new URL(effective.sourceUrl).hostname } catch { return 'unknown' } })() : 'manual',
      extraction_layer: effective.extractionLayer ?? 'unknown',
      ingredient_count: effective.ingredients?.length ?? 0,
    })
    onSaved?.()
  }

  const handleShopInstacart = async () => {
    trackEvent('instacart_recipe_click', {
      recipe_title: effective.title ?? 'unknown',
      ingredient_count: effective.ingredients?.length ?? 0,
    })
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

  const handleApplyEdit = async (edited: Recipe) => {
    if (saved) {
      await updateRecipe(saved.id, edited)
      setEditedRecipe(null)
    } else {
      setEditedRecipe(edited)
    }
    setEditMode(false)
  }

  const handleShare = async () => {
    // On mobile with Web Share API, use native share sheet
    if (navigator.share) {
      const result = await shareRecipe(effective)
      if (result) {
        trackEvent('recipe_shared', { method: 'native' })
        setShareStatus(result)
        setTimeout(() => setShareStatus('idle'), 2000)
      }
      return
    }

    // On desktop, show QR modal
    const qrUrl = await buildQrShareUrl(effective)
    trackEvent('recipe_shared', { method: 'qr' })
    setQrModal(qrUrl ? { url: qrUrl } : 'too-large')
  }

  const handleCopyLink = async () => {
    const result = await shareRecipe(effective)
    if (result) {
      trackEvent('recipe_shared', { method: 'link' })
      setShareStatus(result)
      setTimeout(() => setShareStatus('idle'), 2000)
    }
    setQrModal(null)
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
          {saved && !editMode && (
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
              onClick={() => { trackEvent('recipe_favorited', { action: saved.favorite ? 'unfavorited' : 'favorited' }); toggleFavorite(saved.id, saved.favorite) }}
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
          <button className="nav-btn" onClick={handleShare}>
            {shareStatus === 'copied' ? 'Link Copied!' : shareStatus === 'shared' ? 'Shared!' : 'Share'}
          </button>
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
          onClick={() => { trackEvent('cooking_mode_started', { recipe_title: effective.title ?? 'unknown' }); setCookingMode(true) }}
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
              className="instacart-cta"
              onClick={handleShopInstacart}
              disabled={instacartLoading}
            >
              <img src="/instacart-carrot.svg" alt="" width="22" height="22" />
              {instacartLoading ? 'Loading...' : 'Shop ingredients'}
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

      {qrModal && (
        <div className="qr-modal-overlay" onClick={() => setQrModal(null)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{effective.title}</h3>
            {qrModal === 'too-large' ? (
              <p className="qr-too-large">This recipe is too large for a QR code. Use the link instead.</p>
            ) : (
              <div className="qr-code-container">
                <QRCodeSVG value={qrModal.url} size={200} level="L" />
                <p className="qr-hint">Scan to open this recipe</p>
              </div>
            )}
            <div className="qr-modal-actions">
              <button className="save-btn" onClick={handleCopyLink}>
                {shareStatus === 'copied' ? 'Copied!' : 'Copy Link'}
              </button>
              <button className="nav-btn" onClick={() => setQrModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
