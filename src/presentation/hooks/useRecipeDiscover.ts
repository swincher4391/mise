import { useState, useCallback } from 'react'

export interface DiscoverResult {
  title: string
  sourceUrl: string
  sourceName: string
  description: string
  image: string | null
  rating: number | null
  ratingCount: number | null
}

export function useRecipeDiscover() {
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const search = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setQuery(trimmed)
    setError(null)
    setIsSearching(true)
    setResults([])

    try {
      const response = await fetch(`/api/recipe-discover?q=${encodeURIComponent(trimmed)}`)

      if (!response.ok) {
        let errorMessage = 'Failed to search recipes'
        try {
          const errData = await response.json()
          errorMessage = errData.error || errorMessage
        } catch {
          // ignore
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      const items: DiscoverResult[] = data.results ?? []

      if (items.length === 0) {
        setError('No recipes found. Try a different search term.')
      }

      setResults(items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred'
      setError(msg)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResults([])
    setIsSearching(false)
    setError(null)
    setQuery('')
  }, [])

  return { results, isSearching, error, query, search, clear }
}
