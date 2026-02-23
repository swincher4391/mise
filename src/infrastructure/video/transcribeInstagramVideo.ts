/**
 * Orchestrates Instagram video transcription:
 * 1. Extract video URL via proxy-browser in video mode (Puppeteer)
 * 2. Transcribe video audio via HF Whisper
 */
export async function transcribeInstagramVideo(url: string): Promise<string> {
  // Step 1: Extract the video URL using the existing browser proxy in video mode
  const extractResponse = await fetch(
    `/api/proxy-browser?url=${encodeURIComponent(url)}&mode=video`
  )

  if (!extractResponse.ok) {
    const data = await extractResponse.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Video URL extraction failed (${extractResponse.status})`)
  }

  const { videoUrl } = await extractResponse.json()
  if (!videoUrl) {
    throw new Error('No video URL found on Instagram page')
  }

  // Step 2: Transcribe the video audio
  const transcribeResponse = await fetch('/api/transcribe-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  })

  if (!transcribeResponse.ok) {
    const data = await transcribeResponse.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Transcription failed (${transcribeResponse.status})`)
  }

  const { text, error } = await transcribeResponse.json()
  if (error && !text) {
    throw new Error(error)
  }

  return text ?? ''
}
