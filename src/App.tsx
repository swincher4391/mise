import { useState } from 'react'
import { ExtractPage } from '@presentation/pages/ExtractPage.tsx'
import { LibraryPage } from '@presentation/pages/LibraryPage.tsx'

type View = 'extract' | 'library'

function App() {
  const [view, setView] = useState<View>('extract')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)

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
      onNavigateToLibrary={() => {
        setSelectedRecipeId(null)
        setView('library')
      }}
    />
  )
}

export default App
