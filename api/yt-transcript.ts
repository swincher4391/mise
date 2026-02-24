/**
 * YouTube transcript extraction via innertube player API.
 * Uses Edge Runtime for Cloudflare's network (not Vercel's datacenter IPs).
 */

export const config = {
  runtime: 'edge',
}

const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const videoId = url.searchParams.get('videoId')

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: 'Missing or invalid videoId parameter' }, { status: 400 })
  }

  const apiKey = process.env.HF_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'HF_API_KEY not configured' }, { status: 500 })
  }

  try {
    const transcript = await fetchYouTubeTranscript(videoId)

    if (!transcript || transcript.length < 30) {
      return Response.json(
        { error: 'No captions available for this video', text: null },
        { status: 404 },
      )
    }

    // Structure raw caption text into a recipe via LLM
    try {
      const structureResponse = await fetch(VISION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
          return Response.json({ text: cleaned })
        }
      }
    } catch {
      // Structuring failed — return raw transcript
    }

    return Response.json({ text: transcript })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message, text: null }, { status: 502 })
  }
}

async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  const innertubeKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

  // Step 1: Fetch watch page to establish session cookies
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+299',
    },
    signal: AbortSignal.timeout(10000),
  })

  // Collect cookies from page response
  const setCookies = pageResp.headers.getSetCookie?.() ?? []
  const cookieStr =
    setCookies.map((c: string) => c.split(';')[0]).join('; ') +
    '; CONSENT=YES+cb.20210328-17-p0.en+FX+299'

  // Step 2: Call player endpoint with Android client + session cookies
  const playerResp = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${innertubeKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US)',
        Cookie: cookieStr,
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
    },
  )

  if (!playerResp.ok) {
    throw new Error(`Player API returned ${playerResp.status}`)
  }

  const playerData = await playerResp.json()
  const playStatus = playerData.playabilityStatus?.status ?? 'unknown'
  const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks

  if (!tracks || tracks.length === 0) {
    // Fallback: try extracting caption URL from the page HTML
    const html = await pageResp.clone().text().catch(() => '')
    return extractTranscriptFromPageHtml(html, cookieStr)
      ?? (() => { throw new Error(`No caption tracks (playability: ${playStatus})`) })()
  }

  // Step 3: Fetch caption text with session cookies (prefer English)
  const enTrack = tracks.find((t: any) => t.languageCode === 'en') ?? tracks[0]
  const captionResp = await fetch(enTrack.baseUrl, {
    headers: { Cookie: cookieStr },
    signal: AbortSignal.timeout(10000),
  })

  if (!captionResp.ok) {
    throw new Error(`Caption fetch returned ${captionResp.status}`)
  }

  const captionXml = await captionResp.text()
  if (!captionXml || captionXml.length === 0) {
    throw new Error('Caption URL returned empty response')
  }

  return parseCaptionXml(captionXml)
}

function extractTranscriptFromPageHtml(
  html: string,
  _cookieStr: string,
): string | null {
  // Try to extract caption text from ytInitialPlayerResponse in the page HTML
  const playerMatch =
    html.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s) ??
    html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)

  if (!playerMatch) return null

  try {
    const playerData = JSON.parse(playerMatch[1])
    const tracks =
      playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks || tracks.length === 0) return null

    // Caption URLs from the page HTML typically return empty when fetched
    // server-side (ip=0.0.0.0), but we try anyway
    return null
  } catch {
    return null
  }
}

function parseCaptionXml(xml: string): string | null {
  // Format 1: <p> elements with <s> word segments
  const paragraphs = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]
  if (paragraphs.length > 0) {
    const lines = paragraphs
      .map((p) => {
        const segments = [...p[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
        return segments
          .map((s) => s[1])
          .join(' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      })
      .filter((t) => t.trim())
    const text = lines.join(' ').replace(/\s+/g, ' ').trim()
    return text || null
  }

  // Format 2: <text> elements
  const textMatches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
  if (textMatches.length > 0) {
    const lines = textMatches
      .map((m) =>
        m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n/g, ' '),
      )
      .filter(Boolean)
    const text = lines.join(' ').replace(/\s+/g, ' ').trim()
    return text || null
  }

  return null
}
