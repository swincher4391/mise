import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-ignore -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { unlinkSync } from 'fs'
import { launchAndCaptureVideo } from './_lib/videoCapture.js'
import { extractWavFromVideo } from './_lib/audioExtraction.js'
import { extractFrameGrids, uploadFramesInParallel } from './_lib/frameExtraction.js'
import { isBlockedUrl, isBlockedAfterResolve } from './_lib/ssrf.js'
import { enforceRateLimit } from './_lib/rateLimit.js'

export const maxDuration = 60

const WHISPER_URL = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3'
const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'
// Frame OCR needs the vision model above; structuring an audio transcript is a
// pure-text task. Qwen3-30B-A3B is an MoE with only 3B active params: free-tier
// friendly but far better than the old 7B. Pinned to featherless-ai, the
// provider that serves it. Override via STRUCTURE_MODEL.
const STRUCTURE_MODEL = process.env.STRUCTURE_MODEL || 'Qwen/Qwen3-30B-A3B-Instruct-2507:featherless-ai'

/** Sends WAV audio to Whisper and optionally structures the transcript via LLM. */
async function runAudioPipeline(
  videoBuffer: Buffer,
  apiKey: string,
  tmpFiles: string[]
): Promise<string> {
  const wavBuffer = extractWavFromVideo(videoBuffer, tmpFiles)

  const whisperResponse = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'audio/wav',
    },
    body: new Uint8Array(wavBuffer),
    signal: AbortSignal.timeout(30000),
  })

  if (!whisperResponse.ok) {
    const errorText = await whisperResponse.text()
    throw new Error(`Whisper API error (${whisperResponse.status}): ${errorText.slice(0, 200)}`)
  }

  const data = await whisperResponse.json()
  const rawTranscript = data.text ?? ''

  if (!rawTranscript) return ''

  // Post-process: ask LLM to structure the raw transcript into a recipe
  try {
    const structureResponse = await fetch(VISION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: STRUCTURE_MODEL,
        messages: [
          {
            role: 'user',
            content: `Below is a raw audio transcript from a cooking video. Extract and structure it into a recipe.

CRITICAL RULES:
- Include EVERY ingredient mentioned, with EXACT quantities spoken (e.g. "one and a half cups" → "1.5 cups", "twenty-four ounces" → "24 oz")
- Use the SPECIFIC ingredient names spoken (e.g. "fat-free milk" not just "milk", "garlic salt" not just "salt", "protein pasta" not just "pasta", "smoked paprika" not just "paprika")
- Include EXACT cooking methods mentioned (e.g. "air fryer at 375" not "oven", "blend" not "mix")
- Include EXACT times mentioned (e.g. "15 minutes" not omitted)
- Do NOT summarize, generalize, or omit details. Be literal and precise.
- If the speaker says a brand name or specific product (e.g. "mac and cheese packet"), include it

Return ONLY the recipe as plain text with:
- Title on the first line
- "Ingredients:" section with each ingredient on its own line, prefixed with "- " with quantities
- "Instructions:" section with numbered steps including times and temperatures

If the transcript does not contain a recipe, return an empty string.

Transcript:
${rawTranscript}`,
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
      if (cleaned) return cleaned
    }
  } catch {
    // Structuring failed — return raw transcript
  }

  return rawTranscript
}

/** Extracts frame grids, uploads them, and sends to Qwen Vision for OCR. */
async function runFramePipeline(
  videoBuffer: Buffer,
  apiKey: string,
  tmpFiles: string[]
): Promise<string> {
  const grids = extractFrameGrids(videoBuffer, tmpFiles)
  if (grids.length === 0) throw new Error('No frame grids could be extracted from video')

  const frameUrls = await uploadFramesInParallel(grids)
  if (frameUrls.length === 0) throw new Error('No frame grids could be uploaded')

  const imageContent = frameUrls.map((url) => ({
    type: 'image_url' as const,
    image_url: { url },
  }))

  const visionResponse = await fetch(VISION_URL, {
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
          content: [
            {
              type: 'text',
              text: `These are 3x3 grid collages of frames from a cooking video, in chronological order (left-to-right, top-to-bottom within each grid, then next grid). Each grid contains 9 frames showing different moments. Recipe steps appear as text overlaid on the video — each step shows briefly then disappears, so different frames capture different steps.

Read ALL text visible across ALL grids and ALL frames within each grid. Combine them into the complete recipe in chronological order. Do not skip any steps — even if text is small, read it carefully. Ingredients are implied by the steps (e.g. "cook the chicken" implies chicken).

Return the recipe as plain text with:
- Title on the first line (infer from the steps if not shown)
- "Instructions:" section with numbered steps in order

If no recipe text is visible in any frame, return an empty string.`,
            },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!visionResponse.ok) {
    const errorText = await visionResponse.text()
    throw new Error(`Vision API error (${visionResponse.status}): ${errorText.slice(0, 200)}`)
  }

  const visionData = await visionResponse.json()
  let extractedText = visionData.choices?.[0]?.message?.content ?? ''

  extractedText = extractedText
    .replace(/```\w*\n?/g, '')
    .replace(/\*\*/g, '')
    .trim()

  return extractedText
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  const mode = req.query.mode

  res.setHeader('Access-Control-Allow-Origin', '*')

  // The most expensive endpoint in the app: a headless Chromium per call, and
  // for analyze-video also Whisper plus two LLM calls. Checked before the SSRF
  // resolve so a flood can't drive DNS lookups either. analyze-video gets a
  // much tighter allowance than plain HTML rendering.
  const isAnalyze = mode === 'analyze-video'
  const allowed = await enforceRateLimit(req, res, {
    name: isAnalyze ? 'proxy-browser-analyze' : 'proxy-browser',
    limit: isAnalyze ? 5 : 20,
    windowSec: 600,
    dailyGlobalLimit: isAnalyze ? 300 : 3000,
  })
  if (!allowed) return

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  if (await isBlockedAfterResolve(targetUrl)) {
    return res.status(403).json({ error: 'URL resolves to a blocked address' })
  }

  // YouTube captions are handled by the dedicated /api/yt-transcript endpoint.
  // The unified analyze-video (whisper + frames) path is allowed for YouTube as
  // the fallback route when captions aren't available server-side. The legacy
  // single-purpose debug modes stay blocked to avoid 60s Puppeteer hangs.
  const isYouTube = /youtube\.com|youtu\.be/i.test(targetUrl)
  if (isYouTube && (mode === 'transcribe' || mode === 'ocr-frames')) {
    return res.status(400).json({
      error: 'Use /api/yt-transcript for YouTube captions',
    })
  }

  const tmpFiles: string[] = []
  try {
    // ── analyze-video: single capture, parallel audio + frame pipelines ──
    if (mode === 'analyze-video') {
      const apiKey = process.env.HF_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
      }

      const { videoBuffer } = await launchAndCaptureVideo(targetUrl, { maxRecordMs: 20000 })

      // Run both extraction paths in parallel
      const [audioResult, frameResult] = await Promise.allSettled([
        runAudioPipeline(videoBuffer, apiKey, tmpFiles),
        runFramePipeline(videoBuffer, apiKey, tmpFiles),
      ])

      const transcript = audioResult.status === 'fulfilled' ? audioResult.value : ''
      const transcriptError = audioResult.status === 'rejected'
        ? (audioResult.reason instanceof Error ? audioResult.reason.message : String(audioResult.reason))
        : null

      const ocrText = frameResult.status === 'fulfilled' ? frameResult.value : ''
      const ocrError = frameResult.status === 'rejected'
        ? (frameResult.reason instanceof Error ? frameResult.reason.message : String(frameResult.reason))
        : null

      return res.status(200).json({
        transcript: transcript || null,
        ocrText: ocrText || null,
        transcriptError,
        ocrError,
      })
    }

    // ── transcribe: audio-only path (kept for debugging) ──
    if (mode === 'transcribe') {
      const apiKey = process.env.HF_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
      }

      const { videoBuffer } = await launchAndCaptureVideo(targetUrl)

      try {
        const text = await runAudioPipeline(videoBuffer, apiKey, tmpFiles)
        if (!text) {
          return res.status(200).json({ text: null, error: 'No speech detected' })
        }
        return res.status(200).json({ text })
      } catch (err: any) {
        return res.status(502).json({ error: err.message ?? 'Audio pipeline failed' })
      }
    }

    // ── ocr-frames: frame-only path (kept for debugging) ──
    if (mode === 'ocr-frames') {
      const apiKey = process.env.HF_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
      }

      const { videoBuffer } = await launchAndCaptureVideo(targetUrl, { maxRecordMs: 30000 })

      try {
        const text = await runFramePipeline(videoBuffer, apiKey, tmpFiles)
        return res.status(200).json({ text: text || null })
      } catch (err: any) {
        return res.status(502).json({ error: err.message ?? 'Frame pipeline failed' })
      }
    }

    // ── Default mode: return rendered HTML ──
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    try {
      const page = await browser.newPage()

      // Use domcontentloaded instead of networkidle2 — ad-heavy recipe sites
      // (allrecipes, food network, etc.) never reach network idle within timeout.
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

      // Re-resolve, not just pattern-match: a redirect to a hostname that
      // resolves to a private IP passes isBlockedUrl. The browser has already
      // navigated at this point, so this stops the content reaching the client
      // rather than stopping the request.
      const finalUrl = page.url()
      if (isBlockedUrl(finalUrl) || (await isBlockedAfterResolve(finalUrl))) {
        return res.status(403).json({ error: 'Redirect target URL not allowed' })
      }

      // Wait for JSON-LD to appear (most recipe sites inject it early)
      await page
        .waitForFunction('!!document.querySelector(\'script[type="application/ld+json"]\')', {
          timeout: 10000,
        })
        .catch(() => {})

      // Extra settle time for late-loading JSON-LD or client-rendered content
      await new Promise((r) => setTimeout(r, 2000))

      const html = await page.evaluate(() => document.documentElement.outerHTML)

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Security-Policy', 'sandbox')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      return res.status(200).send(html)
    } finally {
      await browser.close().catch(() => {})
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Browser fetch failed: ${message}` })
  } finally {
    for (const f of tmpFiles) {
      try { unlinkSync(f) } catch {}
    }
  }
}
