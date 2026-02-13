import { useState, useRef } from 'react'
import { compressImage } from '@infrastructure/imageProcessing.ts'

interface UrlInputProps {
  onExtract: (url: string) => void
  onImageSelected: (imageBase64: string) => void
  isLoading: boolean
}

export function UrlInput({ onExtract, onImageSelected, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onExtract(trimmed)
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset the input so the same file can be selected again
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      try {
        const compressed = await compressImage(raw)
        onImageSelected(compressed)
      } catch {
        // If compression fails, send the original
        onImageSelected(raw)
      }
    }
    reader.readAsDataURL(file)
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
        {isLoading ? 'Extracting...' : 'Extract'}
      </button>
      <button
        type="button"
        className="image-btn"
        onClick={handleImageClick}
        disabled={isLoading}
        title="Extract from photo"
      >
        Photo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </form>
  )
}
