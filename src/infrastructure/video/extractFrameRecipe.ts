/**
 * Extracts recipe text from video frames via OCR.
 * Calls the proxy-browser serverless function in ocr-frames mode, which:
 * 1. Captures the video with Puppeteer
 * 2. Extracts evenly-spaced frames with ffmpeg
 * 3. Uploads frames to tmpfiles.org
 * 4. Sends all frames to Qwen vision model to read overlaid text
 */
export async function extractFrameRecipe(url: string): Promise<string> {
  const response = await fetch(
    `/api/proxy-browser?url=${encodeURIComponent(url)}&mode=ocr-frames`
  )

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Frame OCR failed (${response.status})`)
  }

  const { text, error } = await response.json()
  if (error && !text) {
    throw new Error(error)
  }

  return text ?? ''
}
