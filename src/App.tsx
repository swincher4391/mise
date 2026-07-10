import { useState, useCallback, useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { initAnalytics, trackEvent } from '@infrastructure/analytics/track.ts'
import { MealPlanPage } from '@presentation/pages/MealPlanPage.tsx'
import { ExtractPage } from '@presentation/pages/ExtractPage.tsx'
import { LibraryPage } from '@presentation/pages/LibraryPage.tsx'
import { GroceryPage } from '@presentation/pages/GroceryPage.tsx'
import { TopNav } from '@presentation/components/BottomNav.tsx'
import { InstallBanner } from '@presentation/components/InstallBanner.tsx'
import { useExtensionImport } from '@presentation/hooks/useExtensionImport.ts'
import { useShareTarget } from '@presentation/hooks/useShareTarget.ts'
import { usePurchase } from '@presentation/hooks/usePurchase.ts'
import { useInstallPrompt } from '@presentation/hooks/useInstallPrompt.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

type View = 'plan' | 'extract' | 'library' | 'grocery'

const VIEWS: View[] = ['plan', 'extract', 'library', 'grocery']

/** 'extract' is the default view, and lives at the bare URL (no hash). */
function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (VIEWS as string[]).includes(hash) ? (hash as View) : 'extract'
}

// One-time cleanup: remove legacy Kroger tokens from localStorage.
// These were stored client-side before the migration to encrypted HttpOnly cookies.
const LEGACY_KEYS = ['kroger_access_token', 'kroger_refresh_token', 'kroger_token_expiry', 'kroger_selected_store']
LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))

initAnalytics()

function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [importedRecipe, setImportedRecipe] = useState<Recipe | null>(null)
  const [sharedUrl, setSharedUrl] = useState<string | null>(null)
  const purchase = usePurchase()
  const installPrompt = useInstallPrompt()

  /**
   * Views are history entries. Without this, the app has no history and a
   * mobile user pressing Back after two taps is thrown out of the site, and no
   * view can be linked to.
   */
  const navigate = useCallback((next: View) => {
    setView(next)
    const hash = next === 'extract' ? '' : `#/${next}`
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash || window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setView(viewFromHash())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleExtensionRecipe = useCallback((recipe: Recipe) => {
    setImportedRecipe(recipe)
    navigate('extract')
  }, [navigate])

  const handleShareTarget = useCallback((url: string) => {
    setSharedUrl(url)
    navigate('extract')
  }, [navigate])

  const handleShareImport = useCallback((recipe: Recipe) => {
    setImportedRecipe(recipe)
    navigate('extract')
  }, [navigate])

  useExtensionImport(handleExtensionRecipe)
  useShareTarget(handleShareTarget, handleShareImport)

  const renderPage = () => {
    switch (view) {
      case 'plan':
        return (
          <MealPlanPage
            onNavigateToGrocery={() => navigate('grocery')}
          />
        )
      case 'extract':
        return (
          <ExtractPage
            importedRecipe={importedRecipe}
            onImportedRecipeConsumed={() => setImportedRecipe(null)}
            sharedUrl={sharedUrl}
            onSharedUrlConsumed={() => setSharedUrl(null)}
            onNavigateToLibrary={() => {
              setSelectedRecipeId(null)
              navigate('library')
            }}
            purchase={purchase}
            onRecipeExtracted={installPrompt.markExtracted}
          />
        )
      case 'library':
        return (
          <LibraryPage
            selectedRecipeId={selectedRecipeId}
            onNavigateToExtract={() => navigate('extract')}
            onSelectRecipe={setSelectedRecipeId}
            purchase={purchase}
          />
        )
      case 'grocery':
        return (
          <GroceryPage
            onNavigateToLibrary={() => {
              setSelectedRecipeId(null)
              navigate('library')
            }}
          />
        )
    }
  }

  return (
    <>
      <TopNav current={view} onChange={(v) => { trackEvent('nav_switched', { view: v }); navigate(v) }} />
      {renderPage()}
      {installPrompt.showInstallBanner && (
        <InstallBanner onInstall={installPrompt.install} onDismiss={installPrompt.dismiss} />
      )}
      <Analytics />
      <a href="https://peerpush.net/p/mise" target="_blank" rel="noopener" className="peerpush-badge">
        <img src="https://peerpush.net/p/mise/badge.png" alt="Mise on PeerPush" width={230} />
      </a>
      <div className="app-version">v{__APP_VERSION__} · <a href="https://privacy.swinch.dev" target="_blank" rel="noopener noreferrer">Privacy</a></div>
    </>
  )
}

export default App
