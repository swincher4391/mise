/**
 * Extracts YouTube video transcript via captions (no Puppeteer needed).
 * Uses the /api/yt-transcript edge endpoint which calls YouTube's innertube API
 * with Android client impersonation to access caption tracks.
 */
export async function transcribeYouTubeVideo(url: string): Promise<string> {
  // Extract video ID from various YouTube URL formats
  const videoId = url.match(/(?:shorts\/|youtu\.be\/|[?&]v=)([^&?/\s]{11})/)?.[1]
  if (!videoId) {
    throw new Error('Could not extract YouTube video ID from URL')
  }

  const response = await fetch(`/api/yt-transcript?videoId=${videoId}`)

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `YouTube transcript failed (${response.status})`)
  }

  const { text, error } = await response.json()
  if (error && !text) {
    throw new Error(error)
  }

  return text ?? ''
}
