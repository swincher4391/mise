import { useEffect, useState } from 'react'
import { useRecipeExtraction } from '@presentation/hooks/useRecipeExtraction.ts'
import { UrlInput } from '@presentation/components/UrlInput.tsx'
import { RecipeDisplay } from '@presentation/components/RecipeDisplay.tsx'
import { ErrorDisplay } from '@presentation/components/ErrorDisplay.tsx'
import { PwaStatus } from '@presentation/components/PwaStatus.tsx'
import { UpgradePrompt } from '@presentation/components/UpgradePrompt.tsx'
import { BatchImportPage } from '@presentation/pages/BatchImportPage.tsx'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
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
    const lines = editableOcrText.split('\n').filter((l) => l.trim())
    if (lines.length === 0) return

    // Try to detect sections: title, ingredients, steps
    let title = lines[0]
    const ingredientLines: string[] = []
    const stepLines: string[] = []

    // Clean title — strip leading symbols, list markers, etc.
    title = title.replace(/^[<\u00ae=\-[\]0-9.]+\s*/, '').trim()

    let section: 'unknown' | 'ingredients' | 'steps' = 'unknown'

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const lower = line.toLowerCase().trim()

      // Detect section headers
      if (/^(=\s*)?ingredients\s*:?$/i.test(lower) || lower === '= ingredients:') {
        section = 'ingredients'
        continue
      }
      if (/^(instructions|steps|directions|method)\s*:?$/i.test(lower)) {
        section = 'steps'
        continue
      }

      // Skip UI artifacts (buttons, category labels, etc.)
      if (/^[\u00ae<>[\]]+/.test(line.trim()) || /^(DO category|Addo List|Plan Meal)/i.test(lower)) {
        continue
      }

      // Clean leading markers (-, *, numbers with dots)
      const cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+\.\s*/, '').trim()
      if (!cleaned) continue

      if (section === 'ingredients') {
        ingredientLines.push(cleaned)
      } else if (section === 'steps') {
        stepLines.push(cleaned)
      } else {
        // Before any section header — try to detect by format
        if (/^[-*\u2022]\s/.test(line.trim()) || /^\d+[a-z]*\s*(cup|tbsp|tsp|tablespoon|teaspoon|oz|lb|g|kg|ml)\b/i.test(cleaned)) {
          ingredientLines.push(cleaned)
        } else if (/^\d+\.\s/.test(line.trim())) {
          stepLines.push(cleaned)
        }
      }
    }

    const recipe = createManualRecipe({
      title,
      ingredientLines,
      stepLines,
    })
    recipe.extractionLayer = 'image'
    setRecipe(recipe)
    clearOcrText()
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
      {!recipe && !isLoading && !error && !ocrText && (
        <div className="try-it-section">
          <p className="try-it-hint">First time? See it in action:</p>
          <button
            className="try-it-btn"
            onClick={() => extract('https://www.allrecipes.com/recipe/26317/chicken-pot-pie-ix/')}
          >
            Try with an example recipe
          </button>
        </div>
      )}

      {recipe && <RecipeDisplay recipe={recipe} showSaveButton purchase={purchase} />}

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
