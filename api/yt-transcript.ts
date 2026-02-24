/**
 * YouTube transcript extraction via Supadata API.
 * YouTube blocks datacenter IPs from accessing captions directly, so we use
 * Supadata's free-tier transcript API (100 credits/month) as a relay.
 *
 * Fallback: Direct innertube API with Android client impersonation (works
 * from residential IPs but blocked from most datacenter IPs).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 30

const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = req.query.videoId
  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Missing or invalid videoId parameter' })
  }

  const hfKey = process.env.HF_API_KEY
  if (!hfKey) {
    return res.status(500).json({ error: 'HF_API_KEY not configured' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    // Try multiple approaches in order of reliability
    let transcript: string | null = null

    // Approach 1: Supadata free-tier API (most reliable from datacenter)
    const supadataKey = process.env.SUPADATA_API_KEY
    if (supadataKey) {
      try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`
        const supadataResp = await fetch(
          `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(ytUrl)}&text=true&lang=en`,
          {
            headers: { 'x-api-key': supadataKey },
            signal: AbortSignal.timeout(15000),
          },
        )
        if (supadataResp.ok) {
          const data = await supadataResp.json()
          // text=true returns { content: "full text" }
          transcript = data.content ?? null
        }
      } catch {
        // Supadata failed — try fallback
      }
    }

    // Approach 2: Direct innertube API with Android client (works from residential IPs)
    if (!transcript) {
      transcript = await fetchYouTubeTranscriptDirect(videoId)
    }

    if (!transcript || transcript.length < 30) {
      return res.status(404).json({
        error: 'No captions available for this video',
        text: null,
      })
    }

    // Structure raw caption text into a recipe via LLM
    try {
      const structureResponse = await fetch(VISION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: `Below is a raw auto-generated caption transcript from a cooking video. Extract and structure it into a recipe. Return ONLY the recipe as plain text with:
- Title on the first line
- "Ingredients:" section with each ingredient on its own line, prefixed with "- "
- "Instructions:" section with numbered steps

If the transcript does not contain a recipe, return an empty string.

Transcript:
${transcript}`,
            },
          ],
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (structureResponse.ok) {
        const structureData = await structureResponse.json()
        const structured = structureData.choices?.[0]?.message?.content ?? ''
        const cleaned = structured.replace(/```\w*\n?/g, '').replace(/\*\*/g, '').trim()
        if (cleaned) {
          return res.status(200).json({ text: cleaned })
        }
      }
    } catch {
      // Structuring failed — return raw transcript
    }

    return res.status(200).json({ text: transcript })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: message, text: null })
  }
}

/**
 * Direct innertube API approach — works from residential IPs but blocked from
 * most datacenter IPs (returns LOGIN_REQUIRED).
 */
async function fetchYouTubeTranscriptDirect(videoId: string): Promise<string | null> {
  const apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

  // Fetch watch page to establish session cookies
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+299',
    },
    signal: AbortSignal.timeout(10000),
  })

  const cookies = pageResp.headers.getSetCookie?.() ?? []
  const cookieStr = cookies.map((c: string) => c.split(';')[0]).join('; ') + '; CONSENT=YES+cb.20210328-17-p0.en+FX+299'

  // Call player endpoint with Android client + session cookies
  const playerResp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US)',
      'Cookie': cookieStr,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          androidSdkVersion: 34,
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!playerResp.ok) return null
  const playerData = await playerResp.json()

  const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) return null

  const enTrack = tracks.find((t: any) => t.languageCode === 'en') ?? tracks[0]
  const captionResp = await fetch(enTrack.baseUrl, {
    headers: { 'Cookie': cookieStr },
    signal: AbortSignal.timeout(10000),
  })
  if (!captionResp.ok) return null

  const xml = await captionResp.text()
  if (!xml || xml.length === 0) return null

  return parseCaptionXml(xml)
}

function parseCaptionXml(xml: string): string | null {
  // Format 1: <p> with <s> segments
  const paragraphs = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]
  if (paragraphs.length > 0) {
    const text = paragraphs.map(p => {
      const segs = [...p[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
      return segs.map(s => s[1]).join(' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    }).filter(t => t.trim()).join(' ').replace(/\s+/g, ' ').trim()
    return text || null
  }

  // Format 2: <text> elements
  const textMatches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
  if (textMatches.length > 0) {
    const text = textMatches.map(m =>
      m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ')
    ).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    return text || null
  }

  return null
}
