export interface AnalyzeVideoResult {
  transcript: string | null
  ocrText: string | null
  transcriptError: string | null
  ocrError: string | null
}

/**
 * Calls the unified analyze-video endpoint that captures video once
 * and runs audio transcription + frame OCR in parallel.
 */
export async function analyzeVideo(url: string): Promise<AnalyzeVideoResult> {
  const response = await fetch(
    `/api/proxy-browser?url=${encodeURIComponent(url)}&mode=analyze-video`
  )

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Video analysis failed (${response.status})`)
  }

  return response.json()
}
