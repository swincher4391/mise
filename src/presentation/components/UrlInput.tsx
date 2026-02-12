import { useState, useRef } from 'react'

const MAX_DIMENSION = 1500
const JPEG_QUALITY = 0.8
const CONTRAST = 1.5

/** Convert to high-contrast grayscale so colored text (neon green, etc.) is readable by the vision model */
function preprocessPixels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const d = imageData.data
  // Contrast curve factor: maps contrast multiplier to pixel adjustment
  const f = (259 * (CONTRAST * 128 + 255)) / (255 * (259 - CONTRAST * 128))

  for (let i = 0; i < d.length; i += 4) {
    // Luminance-weighted grayscale
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    // Stretch contrast around midpoint
    const v = Math.max(0, Math.min(255, f * (gray - 128) + 128))
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
  }

  ctx.putImageData(imageData, 0, 0)
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img

      // Only resize if the image exceeds the max dimension
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not create canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      preprocessPixels(ctx, width, height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

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
