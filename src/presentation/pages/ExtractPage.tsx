import { useRecipeExtraction } from '@presentation/hooks/useRecipeExtraction.ts'
import { UrlInput } from '@presentation/components/UrlInput.tsx'
import { RecipeDisplay } from '@presentation/components/RecipeDisplay.tsx'
import { ErrorDisplay } from '@presentation/components/ErrorDisplay.tsx'
import { PwaStatus } from '@presentation/components/PwaStatus.tsx'

interface ExtractPageProps {
  onNavigateToLibrary: () => void
}

export function ExtractPage({ onNavigateToLibrary }: ExtractPageProps) {
  const { recipe, isLoading, error, extract } = useRecipeExtraction()

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
      </div>
      <UrlInput onExtract={extract} isLoading={isLoading} />
      {isLoading && (
        <div className="loading">
          <p>Extracting recipe...</p>
        </div>
      )}
      {error && <ErrorDisplay error={error} />}
      {recipe && <RecipeDisplay recipe={recipe} showSaveButton />}
    </main>
  )
}
