import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-ignore -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { unlinkSync } from 'fs'
import { launchAndCaptureVideo } from './_lib/videoCapture.js'
import { extractWavFromVideo } from './_lib/audioExtraction.js'
import { extractFrameGrids, uploadFramesInParallel } from './_lib/frameExtraction.js'

export const maxDuration = 60

function isBlockedUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true

  const hostname = parsed.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname === '[::1]') return true

  const ipPatterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  ]
  if (ipPatterns.some((p) => p.test(hostname))) return true

  if (['metadata.google.internal', 'metadata.google', 'instance-data'].includes(hostname))
    return true

  return false
}

const WHISPER_URL = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3'
const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'

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
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: `Below is a raw audio transcript from a cooking video. Extract and structure it into a recipe. Return ONLY the recipe as plain text with:
- Title on the first line
- "Ingredients:" section with each ingredient on its own line, prefixed with "- "
- "Instructions:" section with numbered steps

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

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  const mode = req.query.mode

  res.setHeader('Access-Control-Allow-Origin', '*')

  // YouTube is handled by the dedicated /api/yt-transcript edge endpoint.
  // Block YouTube from the Puppeteer function to prevent 60s hangs.
  const isYouTube = /youtube\.com|youtu\.be/i.test(targetUrl)
  if (isYouTube && (mode === 'transcribe' || mode === 'ocr-frames' || mode === 'analyze-video')) {
    return res.status(400).json({
      error: 'Use /api/yt-transcript for YouTube videos',
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

      const { videoBuffer } = await launchAndCaptureVideo(targetUrl)

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
