import { useState, useMemo } from 'react'
import { useSavedRecipes, useSavedRecipe } from '@presentation/hooks/useSavedRecipes.ts'
import { getAllRecipes } from '@infrastructure/db/recipeRepository.ts'
import { buildExportData, downloadJson } from '@application/export/exportRecipes.ts'
import { shouldNudgeBackup, resetSaveCount } from '@infrastructure/backup/backupNudge.ts'
import { RecipeDisplay } from '@presentation/components/RecipeDisplay.tsx'
import { RecipeCard } from '@presentation/components/RecipeCard.tsx'
import { ManualEntryForm } from '@presentation/components/ManualEntryForm.tsx'
import { ImportDialog } from '@presentation/components/ImportDialog.tsx'
import { PaidFeatureGate } from '@presentation/components/PaidFeatureGate.tsx'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { PurchaseState } from '@presentation/hooks/usePurchase.ts'
import { MEAL_TYPES, SUB_CATEGORIES, ALL_PRESET_TAGS } from '@presentation/components/TagManager.tsx'

interface LibraryPageProps {
  selectedRecipeId: string | null
  onNavigateToExtract: () => void
  onSelectRecipe: (id: string | null) => void
  purchase: PurchaseState
}

export function LibraryPage({ selectedRecipeId, onNavigateToExtract, onSelectRecipe, purchase }: LibraryPageProps) {
  const { recipes, isLoading, save, remove } = useSavedRecipes()
  const selectedRecipe = useSavedRecipe(selectedRecipeId)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const r of recipes) {
      for (const t of r.tags ?? []) {
        if (!(ALL_PRESET_TAGS as readonly string[]).includes(t)) tagSet.add(t)
      }
    }
    return Array.from(tagSet).sort()
  }, [recipes])

  const filteredRecipes = useMemo(() => {
    let result = recipes

    if (showFavoritesOnly) {
      result = result.filter((r) => r.favorite)
    }

    if (selectedTag) {
      result = result.filter((r) => r.tags?.includes(selectedTag))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.sourceDomain.toLowerCase().includes(q) ||
        (r.tags ?? []).some((t) => t.includes(q)) ||
        r.ingredients.some((ing) => ing.ingredient.toLowerCase().includes(q))
      )
    }

    return result
  }, [recipes, showFavoritesOnly, selectedTag, searchQuery])

  const handleExportAll = async () => {
    const all = await getAllRecipes()
    const data = buildExportData(all)
    downloadJson(data)
    resetSaveCount()
    setNudgeDismissed(false)
  }

  const handleDelete = async () => {
    if (!selectedRecipeId) return
    await remove(selectedRecipeId)
    onSelectRecipe(null)
  }

  const handleManualSave = async (recipe: Parameters<typeof save>[0]) => {
    await save(recipe)
    setShowManualEntry(false)
  }

  const handleImport = async (importedRecipes: Recipe[]) => {
    for (const recipe of importedRecipes) {
      await save(recipe)
    }
  }

  const showNudge = !nudgeDismissed && shouldNudgeBackup() && recipes.length > 0

  // Detail view
  if (selectedRecipe) {
    return (
      <main className="extract-page">
        <div className="app-nav">
          <button className="nav-btn" onClick={() => onSelectRecipe(null)}>
            &larr; Back to Library
          </button>
        </div>
        <RecipeDisplay recipe={selectedRecipe} onDelete={handleDelete} purchase={purchase} />
      </main>
    )
  }

  // Manual entry view
  if (showManualEntry) {
    return (
      <main className="extract-page">
        <div className="page-header">
          <h1 className="app-title">Mise</h1>
          <p className="app-tagline">Add Recipe</p>
        </div>
        <ManualEntryForm onSave={handleManualSave} onCancel={() => setShowManualEntry(false)} />
      </main>
    )
  }

  // Library list view
  return (
    <main className="extract-page">
      <div className="page-header">
        <h1 className="app-title">Mise</h1>
        <p className="app-tagline">My Recipes</p>
      </div>
      <div className="app-nav">
        <button className="nav-btn" onClick={onNavigateToExtract}>
          + Extract New
        </button>
        <button className="nav-btn" onClick={() => setShowManualEntry(true)}>
          + Add Manually
        </button>
        <PaidFeatureGate
          isPaid={purchase.isPaid}
          feature="Import lets you bring in recipes from other apps and backups."
          onUpgrade={purchase.upgrade}
          onRestore={purchase.restore}
        >
          <button className="nav-btn" onClick={() => setShowImportDialog(true)}>
            Import
          </button>
        </PaidFeatureGate>
        {recipes.length > 0 && (
          <PaidFeatureGate
            isPaid={purchase.isPaid}
            feature="Export lets you back up all your recipes as a portable JSON file."
            onUpgrade={purchase.upgrade}
            onRestore={purchase.restore}
          >
            <button className="nav-btn" onClick={handleExportAll}>
              Export All
            </button>
          </PaidFeatureGate>
        )}
      </div>

      {showNudge && purchase.isPaid && (
        <div className="backup-nudge">
          <span>You&apos;ve saved several recipes since your last export. Back up your data!</span>
          <div className="nudge-actions">
            <button className="save-btn" onClick={handleExportAll}>Export Now</button>
            <button className="nav-btn" onClick={() => setNudgeDismissed(true)}>Dismiss</button>
          </div>
        </div>
      )}

      {!isLoading && recipes.length > 0 && (
        <div className="library-filters">
          <input
            className="library-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes..."
          />
          <div className="library-filter-row">
            <button
              className={`filter-chip ${showFavoritesOnly ? 'active' : ''}`}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              {'\u2605'} Favorites
            </button>
            {MEAL_TYPES.map((mt) => (
              <button
                key={mt}
                className={`filter-chip meal-type-filter${selectedTag === mt ? ' active' : ''}`}
                onClick={() => setSelectedTag(selectedTag === mt ? null : mt)}
              >
                {mt}
              </button>
            ))}
            {SUB_CATEGORIES.map((sc) => (
              <button
                key={sc}
                className={`filter-chip meal-type-filter${selectedTag === sc ? ' active' : ''}`}
                onClick={() => setSelectedTag(selectedTag === sc ? null : sc)}
              >
                {sc}
              </button>
            ))}
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`filter-chip ${selectedTag === tag ? 'active' : ''}`}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading">
          <p>Loading recipes...</p>
        </div>
      )}
      {!isLoading && recipes.length === 0 && (
        <div className="library-empty">
          <p>No saved recipes yet.</p>
          <p>Extract a recipe and tap Save.</p>
        </div>
      )}
      {!isLoading && recipes.length > 0 && filteredRecipes.length === 0 && (
        <div className="library-empty">
          <p>No recipes match your filters.</p>
        </div>
      )}
      {filteredRecipes.length > 0 && (
        <div className="recipe-card-list">
          {filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelectRecipe} />
          ))}
        </div>
      )}

      {showImportDialog && (
        <ImportDialog
          onImport={handleImport}
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </main>
  )
}
