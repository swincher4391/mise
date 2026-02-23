import { useEffect, useState } from 'react'
import { useRecipeExtraction } from '@presentation/hooks/useRecipeExtraction.ts'
import { UrlInput } from '@presentation/components/UrlInput.tsx'
import { RecipeDisplay } from '@presentation/components/RecipeDisplay.tsx'
import { ErrorDisplay } from '@presentation/components/ErrorDisplay.tsx'
import { PwaStatus } from '@presentation/components/PwaStatus.tsx'
import { UpgradePrompt } from '@presentation/components/UpgradePrompt.tsx'
import { BatchImportPage } from '@presentation/pages/BatchImportPage.tsx'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { PurchaseState } from '@presentation/hooks/usePurchase.ts'

interface ExtractPageProps {
  onNavigateToLibrary: () => void
  importedRecipe?: Recipe | null
  onImportedRecipeConsumed?: () => void
  purchase: PurchaseState
  onRecipeExtracted?: () => void
}

export function ExtractPage({ onNavigateToLibrary, importedRecipe, onImportedRecipeConsumed, purchase, onRecipeExtracted }: ExtractPageProps) {
  const { recipe, isLoading, error, ocrText, extract, extractFromImage, setRecipe, clearOcrText } = useRecipeExtraction()
  const [editableOcrText, setEditableOcrText] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState('')
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [showPasteInput, setShowPasteInput] = useState(false)
  const [pasteText, setPasteText] = useState('')

  useEffect(() => {
    if (importedRecipe) {
      setRecipe(importedRecipe)
      onImportedRecipeConsumed?.()
    }
  }, [importedRecipe, setRecipe, onImportedRecipeConsumed])

  useEffect(() => {
    if (recipe) onRecipeExtracted?.()
  }, [recipe, onRecipeExtracted])

  useEffect(() => {
    if (ocrText) {
      setEditableOcrText(ocrText)
    }
  }, [ocrText])

  const handleBatchGated = () => {
    if (!purchase.isPaid) {
      setUpgradeFeature('Batch photo import lets you import multiple recipe photos at once — perfect for digitizing a cookbook.')
      setShowUpgrade(true)
      return
    }
    setShowBatchImport(true)
  }

  const handleOcrParse = () => {
    const parsed = parseTextRecipe(editableOcrText)
    if (!parsed.title && parsed.ingredientLines.length === 0 && parsed.stepLines.length === 0) return

    const recipe = createManualRecipe(parsed)
    recipe.extractionLayer = 'image'
    setRecipe(recipe)
    clearOcrText()
  }

  const handlePasteParse = () => {
    const parsed = parseTextRecipe(pasteText)
    if (!parsed.title && parsed.ingredientLines.length === 0 && parsed.stepLines.length === 0) return

    const recipe = createManualRecipe(parsed)
    recipe.extractionLayer = 'text'
    setRecipe(recipe)
    setShowPasteInput(false)
    setPasteText('')
  }

  if (showBatchImport) {
    return (
      <BatchImportPage onBack={() => setShowBatchImport(false)} />
    )
  }

  return (
    <main className="extract-page">
      <PwaStatus />
      <div className="page-header">
        <h1 className="app-title">Mise</h1>
        <p className="app-tagline">Just the recipe.</p>
      </div>
      <div className="app-nav">
        <button className="nav-btn" onClick={onNavigateToLibrary}>
          My Recipes
        </button>
        <button className="nav-btn" onClick={handleBatchGated}>
          Batch Import{!purchase.isPaid ? ' \u{1F512}' : ''}
        </button>
      </div>
      <UrlInput
        onExtract={extract}
        onImageSelected={extractFromImage}
        onPasteText={() => setShowPasteInput(true)}
        isLoading={isLoading}
      />
      {isLoading && (
        <div className="loading">
          <p>Extracting recipe...</p>
        </div>
      )}
      {error && <ErrorDisplay error={error} />}
      {ocrText && (
        <div className="ocr-review">
          <h2>Review OCR Text</h2>
          <p className="ocr-hint">
            The vision API was unavailable, so we used OCR. Edit the text below, then click Parse.
            First line becomes the title; remaining lines become ingredients.
          </p>
          <textarea
            className="form-textarea"
            value={editableOcrText}
            onChange={(e) => setEditableOcrText(e.target.value)}
            rows={12}
          />
          <div className="form-actions">
            <button className="save-btn" onClick={handleOcrParse} disabled={!editableOcrText.trim()}>
              Parse Recipe
            </button>
            <button className="nav-btn" onClick={clearOcrText}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showPasteInput && !ocrText && (
        <div className="ocr-review">
          <h2>Paste Recipe Text</h2>
          <p className="ocr-hint">
            Paste your recipe below. First line becomes the title. Use &ldquo;Ingredients:&rdquo; and
            &ldquo;Instructions:&rdquo; headers to separate sections.
          </p>
          <textarea
            className="form-textarea"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
            placeholder={'My Favorite Recipe\n\nIngredients:\n- 2 cups flour\n- 1 cup sugar\n\nInstructions:\n1. Mix dry ingredients\n2. Bake at 350°F for 25 minutes'}
            autoFocus
          />
          <div className="form-actions">
            <button className="save-btn" onClick={handlePasteParse} disabled={!pasteText.trim()}>
              Parse Recipe
            </button>
            <button className="nav-btn" onClick={() => { setShowPasteInput(false); setPasteText('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!recipe && !isLoading && !error && !ocrText && !showPasteInput && (
        <div className="try-it-section">
          <p className="try-it-hint">First time? See it in action:</p>
          <button
            className="try-it-btn"
            onClick={() => extract('https://mise.swinch.dev/the-best-chicken-ever/')}
          >
            Try with an example recipe
          </button>
        </div>
      )}

      {recipe && <RecipeDisplay recipe={recipe} showSaveButton purchase={purchase} onSaved={onNavigateToLibrary} />}

      {showUpgrade && (
        <UpgradePrompt
          feature={upgradeFeature}
          onUpgrade={purchase.upgrade}
          onRestore={purchase.restore}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </main>
  )
}
