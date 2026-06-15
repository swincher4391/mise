export interface AnalyzeVideoResult {
  transcript: string | null
  ocrText: string | null
  transcriptError: string | null
  ocrError: string | null
}

/**
 * Calls the unified analyze-video endpoint that captures video once
 * and runs audio transcription + frame OCR in parallel.
 *
 * `timeoutMs` bounds the client wait so a stalled capture (e.g. DRM-protected
 * YouTube streams that can't be recorded) fails fast instead of hanging the UI
 * until the serverless function's maxDuration.
 */
export async function analyzeVideo(url: string, timeoutMs = 60000): Promise<AnalyzeVideoResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `/api/proxy-browser?url=${encodeURIComponent(url)}&mode=analyze-video`,
      { signal: controller.signal }
    )

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Server error' }))
      throw new Error(data.error ?? `Video analysis failed (${response.status})`)
    }

    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}
