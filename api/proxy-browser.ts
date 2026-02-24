import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-expect-error -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import path from 'path'
// @ts-expect-error -- ffmpeg-static exports a string path
import ffmpegPath from 'ffmpeg-static'

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
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  const mode = req.query.mode // 'transcribe' to extract video + transcribe audio

  res.setHeader('Access-Control-Allow-Origin', '*')

  let browser
  const tmpFiles: string[] = []
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()

    if (mode === 'transcribe') {
      const apiKey = process.env.HF_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
      }

      // Intercept video responses and capture the body directly
      let videoBuffer: Buffer | null = null

      page.on('response', async (response) => {
        if (videoBuffer) return
        const contentType: string = response.headers()['content-type'] ?? ''
        if (contentType.includes('video/mp4') || contentType.includes('video/')) {
          try {
            const buf = await response.buffer()
            if (buf.length > 1000) { // skip tiny segments
              videoBuffer = buf
            }
          } catch {}
        }
      })

      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})

      // If no video captured, try clicking play
      if (!videoBuffer) {
        await page
          .evaluate(() => {
            const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
            playBtn?.click()
          })
          .catch(() => {})

        const deadline = Date.now() + 5000
        while (!videoBuffer && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      // Close browser early to free memory
      await browser.close().catch(() => {})
      browser = null

      if (!videoBuffer) {
        return res.status(404).json({ error: 'No video found on page' })
      }

      if (videoBuffer.length > MAX_VIDEO_SIZE) {
        return res.status(400).json({ error: 'Video exceeds 50MB size limit' })
      }

      // Convert mp4 to wav using ffmpeg
      const tmpMp4 = path.join('/tmp', `video-${Date.now()}.mp4`)
      const tmpWav = path.join('/tmp', `audio-${Date.now()}.wav`)
      tmpFiles.push(tmpMp4, tmpWav)

      writeFileSync(tmpMp4, videoBuffer)

      try {
        execFileSync(ffmpegPath as string, [
          '-y', '-i', tmpMp4,
          '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav',
          tmpWav,
        ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (ffmpegErr: any) {
        const stderr = ffmpegErr?.stderr?.toString?.() ?? ''
        return res.status(502).json({ error: `ffmpeg conversion failed: ${stderr.slice(-300)}` })
      }

      const wavBuffer = readFileSync(tmpWav)

      // Send to HF Whisper
      const whisperResponse = await fetch(WHISPER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: wavBuffer,
        signal: AbortSignal.timeout(30000),
      })

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text()
        return res.status(502).json({
          error: `Whisper API error (${whisperResponse.status}): ${errorText.slice(0, 200)}`,
        })
      }

      const data = await whisperResponse.json()
      const text = data.text ?? ''

      return res.status(200).json({ text: text || null, error: text ? undefined : 'No speech detected' })
    }

    // Default mode: return rendered HTML
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 })

    await page
      .waitForFunction('!!document.querySelector(\'script[type="application/ld+json"]\')', {
        timeout: 10000,
      })
      .catch(() => {})

    const html = await page.evaluate(() => document.documentElement.outerHTML)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Browser fetch failed: ${message}` })
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
    for (const f of tmpFiles) {
      try { unlinkSync(f) } catch {}
    }
  }
}
