import { useState, useCallback } from 'react'
import { ExtractPage } from '@presentation/pages/ExtractPage.tsx'
import { LibraryPage } from '@presentation/pages/LibraryPage.tsx'
import { GroceryPage } from '@presentation/pages/GroceryPage.tsx'
import { useExtensionImport } from '@presentation/hooks/useExtensionImport.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

type View = 'extract' | 'library' | 'grocery'

function App() {
  const [view, setView] = useState<View>('extract')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [importedRecipe, setImportedRecipe] = useState<Recipe | null>(null)

  const handleExtensionRecipe = useCallback((recipe: Recipe) => {
    setImportedRecipe(recipe)
    setView('extract')
  }, [])

  useExtensionImport(handleExtensionRecipe)

  if (view === 'grocery') {
    return (
      <GroceryPage
        onNavigateToLibrary={() => {
          setSelectedRecipeId(null)
          setView('library')
        }}
      />
    )
  }

  if (view === 'library') {
    return (
      <LibraryPage
        selectedRecipeId={selectedRecipeId}
        onNavigateToExtract={() => setView('extract')}
        onNavigateToGrocery={() => setView('grocery')}
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
