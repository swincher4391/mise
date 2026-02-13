import { useState, useCallback } from 'react'
import { MealPlanPage } from '@presentation/pages/MealPlanPage.tsx'
import { ExtractPage } from '@presentation/pages/ExtractPage.tsx'
import { LibraryPage } from '@presentation/pages/LibraryPage.tsx'
import { GroceryPage } from '@presentation/pages/GroceryPage.tsx'
import { TopNav } from '@presentation/components/BottomNav.tsx'
import { InstallBanner } from '@presentation/components/InstallBanner.tsx'
import { useExtensionImport } from '@presentation/hooks/useExtensionImport.ts'
import { usePurchase } from '@presentation/hooks/usePurchase.ts'
import { useInstallPrompt } from '@presentation/hooks/useInstallPrompt.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

type View = 'plan' | 'extract' | 'library' | 'grocery'

function App() {
  const [view, setView] = useState<View>('extract')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [importedRecipe, setImportedRecipe] = useState<Recipe | null>(null)
  const purchase = usePurchase()
  const installPrompt = useInstallPrompt()

  const handleExtensionRecipe = useCallback((recipe: Recipe) => {
    setImportedRecipe(recipe)
    setView('extract')
  }, [])

  useExtensionImport(handleExtensionRecipe)

  const renderPage = () => {
    switch (view) {
      case 'plan':
        return (
          <MealPlanPage
            onNavigateToGrocery={() => setView('grocery')}
          />
        )
      case 'extract':
        return (
          <ExtractPage
            importedRecipe={importedRecipe}
            onImportedRecipeConsumed={() => setImportedRecipe(null)}
            onNavigateToLibrary={() => {
              setSelectedRecipeId(null)
              setView('library')
            }}
            purchase={purchase}
            onRecipeExtracted={installPrompt.markExtracted}
          />
        )
      case 'library':
        return (
          <LibraryPage
            selectedRecipeId={selectedRecipeId}
            onNavigateToExtract={() => setView('extract')}
            onSelectRecipe={setSelectedRecipeId}
            purchase={purchase}
          />
        )
      case 'grocery':
        return (
          <GroceryPage
            onNavigateToLibrary={() => {
              setSelectedRecipeId(null)
              setView('library')
            }}
          />
        )
    }
  }

  return (
    <>
      <TopNav current={view} onChange={setView} />
      {renderPage()}
      {installPrompt.showInstallBanner && (
        <InstallBanner onInstall={installPrompt.install} onDismiss={installPrompt.dismiss} />
      )}
    </>
  )
}

export default App
