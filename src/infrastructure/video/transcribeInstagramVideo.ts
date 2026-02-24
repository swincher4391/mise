/**
 * Transcribes an Instagram reel's audio via a single serverless function that:
 * 1. Opens the page with Puppeteer and captures the video from network responses
 * 2. Converts to wav with ffmpeg
 * 3. Sends to HF Whisper for transcription
 */
export async function transcribeInstagramVideo(url: string): Promise<string> {
  const response = await fetch(
    `/api/proxy-browser?url=${encodeURIComponent(url)}&mode=transcribe`
  )

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Transcription failed (${response.status})`)
  }

  const { text, error } = await response.json()
  if (error && !text) {
    throw new Error(error)
  }

  return text ?? ''
}
