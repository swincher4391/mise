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
    const result = await page.evaluate(async () => {
      const debug: string[] = []
      try {
        // Try the global variable first (faster)
        let playerResponse = (window as any).ytInitialPlayerResponse
        debug.push(`global: ${playerResponse ? 'found' : 'missing'}`)

        // Fall back to script tag parsing
        if (!playerResponse) {
          const scripts = document.querySelectorAll('script')
          debug.push(`scripts: ${scripts.length}`)
          for (const script of scripts) {
            const text = script.textContent || ''
            if (text.includes('ytInitialPlayerResponse')) {
              const match = text.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)
                || text.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)
              if (match) {
                try { playerResponse = JSON.parse(match[1]) } catch (e) {
                  debug.push(`parse error: ${(e as Error).message}`)
                }
              }
              break
            }
          }
        }

        if (!playerResponse) {
          debug.push('no playerResponse')
          // Try to find it in page HTML
          const html = document.documentElement.outerHTML
          const hasYtInit = html.includes('ytInitialPlayerResponse')
          debug.push(`html has ytInitialPlayerResponse: ${hasYtInit}`)
          debug.push(`html length: ${html.length}`)
          debug.push(`title: ${document.title}`)
          return { transcript: null, debug: debug.join('; ') }
        }

        const status = playerResponse.playabilityStatus?.status
        debug.push(`playability: ${status}`)
        debug.push(`hasCaptions: ${!!playerResponse.captions}`)

        if (!playerResponse.captions) {
          return { transcript: null, debug: debug.join('; ') }
        }

        const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks
        debug.push(`tracks: ${tracks?.length ?? 0}`)
        if (!tracks || tracks.length === 0) {
          return { transcript: null, debug: debug.join('; ') }
        }

        const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0]
        debug.push(`trackUrl length: ${track?.baseUrl?.length ?? 0}`)
        if (!track?.baseUrl) {
          return { transcript: null, debug: debug.join('; ') }
        }

        // Fetch captions from inside the page context (has cookies!)
        const resp = await fetch(track.baseUrl)
        debug.push(`captionStatus: ${resp.status}`)
        const xml = await resp.text()
        debug.push(`captionLength: ${xml.length}`)
        if (!xml || xml.length < 10) {
          return { transcript: null, debug: debug.join('; ') }
        }

        // Parse XML - format 1: <p> with <s> segments
        const pMatches = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]
        if (pMatches.length > 0) {
          const text = pMatches.map(p => {
            const segs = [...p[1].matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
            return segs.map(s => s[1]).join(' ')
          }).filter(t => t.trim()).join(' ').replace(/\s+/g, ' ').trim()
          return { transcript: text || null, debug: debug.join('; ') }
        }

        // Parse XML - format 2: <text> elements
        const tMatches = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
        if (tMatches.length > 0) {
          const text = tMatches.map(m => m[1].replace(/\n/g, ' ')).filter(Boolean)
            .join(' ').replace(/\s+/g, ' ').trim()
          return { transcript: text || null, debug: debug.join('; ') }
        }

        debug.push('unknown xml format')
        return { transcript: null, debug: debug.join('; ') }
      } catch (e) {
        debug.push(`error: ${(e as Error).message}`)
        return { transcript: null, debug: debug.join('; ') }
      }
    })

    const transcript = result?.transcript
    const debugInfo = result?.debug

    // Close browser early to free memory
    await browser.close().catch(() => {})
    browser = null

    if (!transcript || transcript.length < 30) {
      return res.status(404).json({
        error: 'No captions available for this video',
        text: null,
        debug: debugInfo,
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
