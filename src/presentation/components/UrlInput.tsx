import { useState } from 'react'
import type { ExtractionStatus } from '@presentation/hooks/useRecipeExtraction.ts'

interface UrlInputProps {
  onExtract: (url: string) => void
  isLoading: boolean
  extractionStatus?: ExtractionStatus | null
}

export function UrlInput({ onExtract, isLoading, extractionStatus }: UrlInputProps) {
  const [url, setUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onExtract(trimmed)
  }

  return (
    <form className="url-input" onSubmit={handleSubmit}>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a recipe URL..."
        disabled={isLoading}
        autoFocus
        required
      />
      <button type="submit" disabled={isLoading || !url.trim()}>
        {isLoading
          ? (extractionStatus?.message ?? 'Extracting…')
          : 'Extract'}
      </button>
    </form>
  )
}
