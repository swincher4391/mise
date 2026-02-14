import { useState, useRef } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import { parsePaprikaFile } from '@application/import/parsePaprika.ts'

interface ImportDialogProps {
  onImport: (recipes: Recipe[]) => Promise<void>
  onClose: () => void
}

type ImportState = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

export function ImportDialog({ onImport, onClose }: ImportDialogProps) {
  const [state, setState] = useState<ImportState>('idle')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setState('parsing')
    setError(null)

    try {
      let parsed: Recipe[]

      if (file.name.endsWith('.paprikarecipes')) {
        parsed = await parsePaprikaFile(file)
      } else if (file.name.endsWith('.json')) {
        parsed = await parseJsonExport(file)
      } else {
        throw new Error('Unsupported file format. Use .paprikarecipes or .json files.')
      }

      if (parsed.length === 0) {
        throw new Error('No recipes found in file.')
      }

      setRecipes(parsed)
      setState('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setState('error')
    }
  }

  const handleImport = async () => {
    setState('importing')
    try {
      await onImport(recipes)
      setImportedCount(recipes.length)
      setSkippedCount(0)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import recipes')
      setState('error')
    }
  }

  return (
    <div className="import-dialog-overlay" onClick={onClose}>
      <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-dialog-header">
          <h2>Import Recipes</h2>
          <button className="nav-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="import-dialog-body">
          {state === 'idle' && (
            <>
              <p>Import recipes from Paprika or a Mise export file.</p>
              <div className="import-formats">
                <div className="import-format">
                  <strong>.paprikarecipes</strong>
                  <span>Import from Paprika 3</span>
                </div>
                <div className="import-format">
                  <strong>.json</strong>
                  <span>Import from Mise export</span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".paprikarecipes,.json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="save-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose File
              </button>
            </>
          )}

          {state === 'parsing' && (
            <div className="loading">
              <p>Reading file...</p>
            </div>
          )}

          {state === 'preview' && (
            <>
              <p>Found <strong>{recipes.length}</strong> recipe{recipes.length !== 1 ? 's' : ''}:</p>
              <ul className="import-preview-list">
                {recipes.slice(0, 10).map((r, i) => (
                  <li key={i}>{r.title}</li>
                ))}
                {recipes.length > 10 && <li>...and {recipes.length - 10} more</li>}
              </ul>
              <div className="import-actions">
                <button className="save-btn" onClick={handleImport}>
                  Import All
                </button>
                <button className="nav-btn" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {state === 'importing' && (
            <div className="loading">
              <p>Importing recipes...</p>
            </div>
          )}

          {state === 'done' && (
            <>
              <p>
                Imported <strong>{importedCount}</strong> recipe{importedCount !== 1 ? 's' : ''} successfully.
                {skippedCount > 0 && ` ${skippedCount} skipped (duplicates).`}
              </p>
              <button className="save-btn" onClick={onClose}>
                Done
              </button>
            </>
          )}

          {state === 'error' && (
            <>
              <p className="error-text">{error}</p>
              <button className="nav-btn" onClick={() => {
                setState('idle')
                setError(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}>
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Parse a Mise JSON export file.
 */
async function parseJsonExport(file: File): Promise<Recipe[]> {
  const text = await file.text()
  const data = JSON.parse(text)

  // Validate Mise export format
  if (data.version && Array.isArray(data.recipes)) {
    return data.recipes.map((r: SavedRecipe) => ({
      ...r,
      // Regenerate ID to avoid conflicts
      id: `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    }))
  }

  // Try parsing as a single recipe
  if (data.title && data.ingredients) {
    return [data as Recipe]
  }

  throw new Error('Unrecognized JSON format. Expected a Mise export file.')
}
