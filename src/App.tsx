import { useState, useCallback } from 'react'
import { ExtractPage } from '@presentation/pages/ExtractPage.tsx'
import { LibraryPage } from '@presentation/pages/LibraryPage.tsx'
import { useExtensionImport } from '@presentation/hooks/useExtensionImport.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

type View = 'extract' | 'library'

function App() {
  const [view, setView] = useState<View>('extract')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [importedRecipe, setImportedRecipe] = useState<Recipe | null>(null)

  const handleExtensionRecipe = useCallback((recipe: Recipe) => {
    setImportedRecipe(recipe)
    setView('extract')
  }, [])

  useExtensionImport(handleExtensionRecipe)

  if (view === 'library') {
    return (
      <LibraryPage
        selectedRecipeId={selectedRecipeId}
        onNavigateToExtract={() => setView('extract')}
        onSelectRecipe={setSelectedRecipeId}
      />
    )
  }

  return (
    <ExtractPage
      importedRecipe={importedRecipe}
      onImportedRecipeConsumed={() => setImportedRecipe(null)}
      onNavigateToLibrary={() => {
        setSelectedRecipeId(null)
        setView('library')
      }}
    />
  )
}

export default App
