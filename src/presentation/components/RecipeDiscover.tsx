import { useState } from 'react'
import { useRecipeDiscover } from '@presentation/hooks/useRecipeDiscover.ts'

interface RecipeDiscoverProps {
  onSelectRecipe: (sourceUrl: string) => void
  onDescribe?: (prompt: string) => void
}

const SUGGESTIONS = [
  'chicken stir fry',
  'banana bread',
  'vegan tacos',
  'pasta carbonara',
  'chocolate chip cookies',
  'beef stew',
]

function formatRatingCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`
  return String(count)
}

export function RecipeDiscover({ onSelectRecipe, onDescribe }: RecipeDiscoverProps) {
  const { results, isSearching, error, query, search } = useRecipeDiscover()
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSearching) return
    search(input)
  }

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion)
    search(suggestion)
  }

  const handleDescribe = () => {
    const prompt = query ? `I want to create a ${query} recipe` : ''
    onDescribe?.(prompt)
  }

  return (
    <div className="recipe-discover">
      <div className="recipe-discover-body">
        <form onSubmit={handleSubmit} className="recipe-discover-search">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search recipes..."
            disabled={isSearching}
            autoFocus
          />
          <button type="submit" disabled={isSearching || !input.trim()}>
            Search
          </button>
        </form>

        {error && <div className="recipe-discover-error">{error}</div>}

        {isSearching && (
          <div className="recipe-discover-loading">Searching...</div>
        )}

        {!isSearching && results.length === 0 && !error && (
          <div className="recipe-discover-suggestions">
            <p>Try searching for:</p>
            <div className="recipe-discover-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="recipe-discover-chip" onClick={() => handleSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="recipe-discover-grid">
              {results.map((r, i) => (
                <button
                  key={r.sourceUrl || i}
                  className="recipe-discover-card"
                  onClick={() => onSelectRecipe(r.sourceUrl)}
                >
                  {r.image && (
                    <img src={r.image} alt={r.title} loading="lazy" />
                  )}
                  <div className="recipe-discover-card-info">
                    <span className="recipe-discover-card-title">{r.title}</span>
                    <span className="recipe-discover-card-source">
                      {r.sourceName}
                      {r.rating != null && (
                        <span className="recipe-discover-card-rating">
                          {' \u2605 '}{r.rating.toFixed(1)}
                          {r.ratingCount != null && ` (${formatRatingCount(r.ratingCount)})`}
                        </span>
                      )}
                    </span>
                    {r.description && (
                      <span className="recipe-discover-card-meta">{r.description}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {onDescribe && (
              <div className="recipe-discover-describe-cta">
                <p>Don't see what you want?</p>
                <button className="recipe-discover-describe-btn" onClick={handleDescribe}>
                  Create with Describe
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
