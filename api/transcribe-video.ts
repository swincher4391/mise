import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 60

const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
const WHISPER_URL = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.HF_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
  }

  const { videoUrl } = req.body ?? {}
  if (!videoUrl || typeof videoUrl !== 'string') {
    return res.status(400).json({ error: 'Missing videoUrl in request body' })
  }

  try {
    // Download the video
    const videoResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) })
    if (!videoResponse.ok) {
      return res.status(502).json({ error: `Failed to download video (${videoResponse.status})` })
    }

    const contentLength = videoResponse.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_VIDEO_SIZE) {
      return res.status(400).json({ error: 'Video exceeds 50MB size limit' })
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    if (videoBuffer.length > MAX_VIDEO_SIZE) {
      return res.status(400).json({ error: 'Video exceeds 50MB size limit' })
    }

    // Send to HF Whisper for transcription
    const whisperResponse = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'audio/mp4',
      },
      body: videoBuffer,
      signal: AbortSignal.timeout(45000),
    })

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text()
      return res.status(502).json({
        error: `Whisper API error (${whisperResponse.status}): ${errorText.slice(0, 200)}`,
      })
    }

    const data = await whisperResponse.json()
    const text = data.text ?? ''

    if (!text.trim()) {
      return res.status(200).json({ text: '', error: 'No speech detected in video' })
    }

    return res.status(200).json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Transcription failed: ${message}` })
  }
}
