import { useEffect, useState, useMemo, useRef } from 'react'
import { useRecipeExtraction } from '@presentation/hooks/useRecipeExtraction.ts'
import { UrlInput } from '@presentation/components/UrlInput.tsx'
import { RecipeDisplay } from '@presentation/components/RecipeDisplay.tsx'
import { ErrorDisplay } from '@presentation/components/ErrorDisplay.tsx'
import { PwaStatus } from '@presentation/components/PwaStatus.tsx'
import { UpgradePrompt } from '@presentation/components/UpgradePrompt.tsx'
import { BatchImportPage } from '@presentation/pages/BatchImportPage.tsx'
import { RecipeChat } from '@presentation/components/RecipeChat.tsx'
import { RecipeDiscover } from '@presentation/components/RecipeDiscover.tsx'
import { isTikTokUrl, isYouTubeShortsUrl, isInstagramUrl } from '@application/extraction/extractInstagramCaption.ts'
import { useVideoExtractionLimit } from '@presentation/hooks/useVideoExtractionLimit.ts'
import type { VideoPlatform } from '@infrastructure/usage/videoExtractionStore.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
import { parseTextRecipe } from '@application/extraction/parseTextRecipe.ts'
import { compressImage } from '@infrastructure/imageProcessing.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { PurchaseState } from '@presentation/hooks/usePurchase.ts'

type TabId = 'extract' | 'photo' | 'paste' | 'describe' | 'discover'

const TABS: TabId[] = ['extract', 'photo', 'paste', 'describe', 'discover']

interface ExtractPageProps {
  onNavigateToLibrary: () => void
  importedRecipe?: Recipe | null
  onImportedRecipeConsumed?: () => void
  sharedUrl?: string | null
  onSharedUrlConsumed?: () => void
  purchase: PurchaseState
  onRecipeExtracted?: () => void
}

export function ExtractPage({ onNavigateToLibrary, importedRecipe, onImportedRecipeConsumed, sharedUrl, onSharedUrlConsumed, purchase, onRecipeExtracted }: ExtractPageProps) {
  const { recipe, isLoading, error, ocrText, extractionStatus, extract, extractFromImage, setRecipe, clearOcrText } = useRecipeExtraction()
  const { canExtract: canExtractVideo, recordExtraction } = useVideoExtractionLimit(purchase.isPaid)
  const [pendingVideoPlatform, setPendingVideoPlatform] = useState<VideoPlatform | null>(null)
  const [editableOcrText, setEditableOcrText] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState('')
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('extract')
  const [pasteText, setPasteText] = useState('')
  const [chatInitialPrompt, setChatInitialPrompt] = useState('')
  const [shortcutDismissed, setShortcutDismissed] = useState(() => localStorage.getItem('mise_shortcut_dismissed') === 'true')
  const isIos = useMemo(() => /iP(hone|ad|od)/i.test(navigator.userAgent), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (importedRecipe) {
      setRecipe(importedRecipe)
      onImportedRecipeConsumed?.()
    }
  }, [importedRecipe, setRecipe, onImportedRecipeConsumed])

  useEffect(() => {
    if (sharedUrl && !isLoading) {
      handleGatedExtract(sharedUrl)
      onSharedUrlConsumed?.()
    }
  }, [sharedUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (recipe) {
      if (pendingVideoPlatform) {
        recordExtraction(pendingVideoPlatform)
        setPendingVideoPlatform(null)
      }
      onRecipeExtracted?.()
    }
  }, [recipe, onRecipeExtracted, pendingVideoPlatform, recordExtraction])

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

  const detectVideoPlatform = (url: string): VideoPlatform | null => {
    if (isTikTokUrl(url)) return 'tiktok'
    if (isYouTubeShortsUrl(url)) return 'youtube'
    if (isInstagramUrl(url)) return 'instagram'
    return null
  }

  const platformLabels: Record<VideoPlatform, string> = {
    tiktok: 'TikTok',
    youtube: 'YouTube Shorts',
    instagram: 'Instagram',
  }

  const handleGatedExtract = (url: string) => {
    const platform = detectVideoPlatform(url)
    if (platform && !canExtractVideo(platform)) {
      setUpgradeFeature(
        `You've used your 3 free ${platformLabels[platform]} imports. Upgrade to Mise Pro for unlimited video imports — just $4.99, one time.`
      )
      setShowUpgrade(true)
      return
    }
    if (platform) setPendingVideoPlatform(platform)
    else setPendingVideoPlatform(null)
    extract(url)
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
    setPasteText('')
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      try {
        const compressed = await compressImage(raw)
        extractFromImage(compressed)
      } catch {
        extractFromImage(raw)
      }
    }
    reader.readAsDataURL(file)
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
        <button className="my-recipes-btn" onClick={onNavigateToLibrary}>
          My Recipes
        </button>
      </div>

      <div className="extract-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`extract-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); if (tab !== 'describe') setChatInitialPrompt('') }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'extract' && (
        <>
          <UrlInput onExtract={handleGatedExtract} isLoading={isLoading} extractionStatus={extractionStatus} />
          {isLoading && (
            <div className="extraction-status" role="status" aria-live="polite">
              {extractionStatus ? (
                <>
                  <div className="extraction-status-bar">
                    <div
                      className="extraction-status-bar-fill"
                      style={{ width: `${(extractionStatus.step / extractionStatus.totalSteps) * 100}%` }}
                    />
                  </div>
                  <p className="extraction-status-message">
                    {extractionStatus.message}
                    <span className="extraction-status-step">
                      {' '}Step {extractionStatus.step} of {extractionStatus.totalSteps}
                    </span>
                  </p>
                </>
              ) : (
                <p>Extracting recipe…</p>
              )}
            </div>
          )}
          {error && <ErrorDisplay error={error} />}
          {!recipe && !isLoading && !error && (
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
          {isIos && !shortcutDismissed && !recipe && !isLoading && (
            <div className="ios-shortcut-tip">
              <button className="ios-shortcut-dismiss" onClick={() => { setShortcutDismissed(true); localStorage.setItem('mise_shortcut_dismissed', 'true') }}>&times;</button>
              <p><strong>Share recipes from any app</strong></p>
              <p>Install the Mise shortcut to share recipe links directly from Instagram, Safari, and more.</p>
              <a
                href="https://www.icloud.com/shortcuts/4dc3d3f7e6fe4c4cbde998deb9c7cf27"
                target="_blank"
                rel="noopener noreferrer"
                className="ios-shortcut-btn"
              >
                Install Shortcut
              </a>
            </div>
          )}
        </>
      )}

      {activeTab === 'photo' && (
        <div className="photo-tab-content">
          <button
            className="save-btn photo-upload-btn"
            onClick={handleImageClick}
            disabled={isLoading}
          >
            {isLoading ? 'Processing…' : 'Upload or Take Photo'}
          </button>
          <button className="nav-btn batch-import-btn" onClick={handleBatchGated}>
            Batch Import{!purchase.isPaid ? ' \u{1F512}' : ''}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {isLoading && (
            <div className="extraction-status" role="status" aria-live="polite">
              {extractionStatus ? (
                <>
                  <div className="extraction-status-bar">
                    <div
                      className="extraction-status-bar-fill"
                      style={{ width: `${(extractionStatus.step / extractionStatus.totalSteps) * 100}%` }}
                    />
                  </div>
                  <p className="extraction-status-message">
                    {extractionStatus.message}
                    <span className="extraction-status-step">
                      {' '}Step {extractionStatus.step} of {extractionStatus.totalSteps}
                    </span>
                  </p>
                </>
              ) : (
                <p>Processing image…</p>
              )}
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
        </div>
      )}

      {activeTab === 'paste' && (
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
          </div>
        </div>
      )}

      {activeTab === 'describe' && (
        <RecipeChat
          onRecipeReady={(r) => { setRecipe(r); setActiveTab('extract') }}
          initialPrompt={chatInitialPrompt}
        />
      )}

      {activeTab === 'discover' && (
        <RecipeDiscover
          onSelectRecipe={(sourceUrl) => { handleGatedExtract(sourceUrl); setActiveTab('extract') }}
          onDescribe={(prompt) => { setActiveTab('describe'); setChatInitialPrompt(prompt) }}
        />
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
