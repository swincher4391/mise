/**
 * YouTube transcript extraction using Puppeteer.
 * Loads the YouTube page in headless Chrome and extracts captions from inside
 * the page's JavaScript context (where the browser has full session cookies).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-expect-error -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const maxDuration = 60

const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = req.query.videoId
  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Missing or invalid videoId parameter' })
  }

  const apiKey = process.env.HF_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'HF_API_KEY not configured' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()

    // Navigate to YouTube watch page
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => {})

    // Wait for YouTube player to initialize
    await new Promise((r) => setTimeout(r, 3000))

    // Extract caption text from inside the page's JS context.
    // The browser has full session cookies, so the timedtext URL works.
    const transcript = await page.evaluate(async () => {
      try {
        // Strategy 1: Extract ytInitialPlayerResponse from the page
        const scripts = document.querySelectorAll('script')
        let playerResponse = null

        for (const script of scripts) {
          const text = script.textContent || ''
          const match = text.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)
            || text.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)
          if (match) {
            try { playerResponse = JSON.parse(match[1]) } catch {}
            break
          }
        }

        // Also try the global variable
        if (!playerResponse) {
          playerResponse = (window as any).ytInitialPlayerResponse
        }

        if (!playerResponse?.captions) return null

        const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks
        if (!tracks || tracks.length === 0) return null

        // Prefer English track
        const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0]
        if (!track?.baseUrl) return null

        // Fetch captions from inside the page context (has cookies!)
        const resp = await fetch(track.baseUrl)
        if (!resp.ok) return null
        const xml = await resp.text()
        if (!xml || xml.length < 10) return null

        // Parse XML - format 1: <p> with <s> segments
        const pMatches = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]
        if (pMatches.length > 0) {
          return pMatches.map(p => {
            const segs = [...p[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
            return segs.map(s => s[1]).join(' ')
          }).filter(t => t.trim()).join(' ').replace(/\s+/g, ' ').trim()
        }

        // Parse XML - format 2: <text> elements
        const tMatches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
        if (tMatches.length > 0) {
          return tMatches.map(m => m[1].replace(/\n/g, ' ')).filter(Boolean)
            .join(' ').replace(/\s+/g, ' ').trim()
        }

        return null
      } catch {
        return null
      }
    })

    // Close browser early to free memory
    await browser.close().catch(() => {})
    browser = null

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
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
