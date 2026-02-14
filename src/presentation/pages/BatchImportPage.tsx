import { useState, useRef, useCallback } from 'react'
import { compressImage, createThumbnail } from '@infrastructure/imageProcessing.ts'
import { extractImageRecipe } from '@infrastructure/ocr/extractImageRecipe.ts'
import { createImageRecipe } from '@application/extraction/createImageRecipe.ts'
import { useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

type PhotoStatus = 'pending' | 'processing' | 'success' | 'error' | 'removed'

interface PhotoItem {
  id: string
  file: File
  thumbnail: string
  status: PhotoStatus
  recipe: Recipe | null
  error: string | null
}

interface BatchImportPageProps {
  onBack: () => void
}

export function BatchImportPage({ onBack }: BatchImportPageProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { save } = useSavedRecipes()
  const abortRef = useRef(false)

  const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''

    const newItems: PhotoItem[] = []
    for (const file of files) {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const thumbnail = await createThumbnail(dataUrl).catch(() => dataUrl)
      newItems.push({
        id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        thumbnail,
        status: 'pending',
        recipe: null,
        error: null,
      })
    }

    setPhotos((prev) => [...prev, ...newItems])
  }, [])

  const processAll = useCallback(async () => {
    abortRef.current = false
    setIsProcessing(true)

    const pending = photos.filter((p) => p.status === 'pending' || p.status === 'error')

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current) break

      const photo = pending[i]
      setCurrentIndex(i + 1)

      // Mark processing
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, status: 'processing' as PhotoStatus, error: null } : p))
      )

      try {
        // Read file as data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Failed to read file'))
          reader.readAsDataURL(photo.file)
        })

        // Compress
        const compressed = await compressImage(dataUrl).catch(() => dataUrl)

        // Extract via vision API
        const result = await extractImageRecipe(compressed)
        const recipe = createImageRecipe({
          title: result.title,
          ingredientLines: result.ingredients,
          stepLines: result.steps,
          servings: result.servings,
          prepTime: result.prepTime,
          cookTime: result.cookTime,
        })

        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: 'success' as PhotoStatus, recipe } : p))
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to extract'
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: 'error' as PhotoStatus, error: message } : p))
        )
      }
    }

    setIsProcessing(false)
  }, [photos])

  const handleStop = () => {
    abortRef.current = true
  }

  const handleRemove = (id: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'removed' as PhotoStatus } : p)))
  }

  const handleRetry = (id: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'pending' as PhotoStatus, error: null } : p)))
  }

  const handleSaveAll = async () => {
    const successful = photos.filter((p) => p.status === 'success' && p.recipe)
    let saved = 0
    for (const photo of successful) {
      if (photo.recipe) {
        await save(photo.recipe)
        saved++
      }
    }
    setSaveResult(`Saved ${saved} recipe${saved !== 1 ? 's' : ''} to your library.`)
  }

  const visiblePhotos = photos.filter((p) => p.status !== 'removed')
  const successCount = photos.filter((p) => p.status === 'success').length
  const pendingCount = photos.filter((p) => p.status === 'pending' || p.status === 'error').length

  return (
    <main className="extract-page">
      <div className="page-header">
        <h1 className="app-title">Mise</h1>
        <p className="app-tagline">Batch Photo Import</p>
      </div>
      <div className="app-nav">
        <button className="nav-btn" onClick={onBack}>
          &larr; Back
        </button>
      </div>

      <div className="batch-import">
        <div className="batch-actions">
          <button className="save-btn" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            + Add Photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            style={{ display: 'none' }}
          />

          {visiblePhotos.length > 0 && !isProcessing && pendingCount > 0 && (
            <button className="save-btn" onClick={processAll}>
              Extract All ({pendingCount})
            </button>
          )}

          {isProcessing && (
            <button className="delete-btn" onClick={handleStop}>
              Stop
            </button>
          )}

          {successCount > 0 && !isProcessing && !saveResult && (
            <button className="save-btn" onClick={handleSaveAll}>
              Save All ({successCount})
            </button>
          )}
        </div>

        {isProcessing && (
          <div className="batch-progress">
            Processing {currentIndex} of {pendingCount}...
          </div>
        )}

        {saveResult && (
          <div className="batch-save-result">
            {saveResult}
          </div>
        )}

        {visiblePhotos.length === 0 && (
          <div className="batch-empty">
            <p>Select photos of recipes to import them in bulk.</p>
            <p>Works with cookbook pages, recipe cards, and handwritten notes.</p>
          </div>
        )}

        {visiblePhotos.length > 0 && (
          <div className="batch-grid">
            {visiblePhotos.map((photo) => (
              <div key={photo.id} className={`batch-item batch-item--${photo.status}`}>
                <img src={photo.thumbnail} alt="" className="batch-thumb" />
                <div className="batch-item-info">
                  {photo.status === 'pending' && <span className="batch-status">Queued</span>}
                  {photo.status === 'processing' && <span className="batch-status batch-status--processing">Extracting...</span>}
                  {photo.status === 'success' && (
                    <span className="batch-status batch-status--success">{photo.recipe?.title}</span>
                  )}
                  {photo.status === 'error' && (
                    <span className="batch-status batch-status--error">{photo.error}</span>
                  )}
                </div>
                <div className="batch-item-actions">
                  {photo.status === 'error' && (
                    <button className="nav-btn" onClick={() => handleRetry(photo.id)}>Retry</button>
                  )}
                  {photo.status !== 'processing' && (
                    <button className="delete-btn" onClick={() => handleRemove(photo.id)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
