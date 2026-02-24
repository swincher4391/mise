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
const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
const FRAMES_PER_GRID = 9 // 3x3 tile per image
const NUM_GRIDS = 4 // Qwen max 4 images per request
const TOTAL_FRAMES = FRAMES_PER_GRID * NUM_GRIDS // 36 frames across the video

async function uploadFrameToTempHost(buffer: Buffer, index: number): Promise<string> {
  const boundary = '----MiseBoundary' + Date.now() + index
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="frame-${index}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    buffer,
    Buffer.from(footer, 'utf-8'),
  ])

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  if (!response.ok) {
    throw new Error(`Frame upload failed (${response.status})`)
  }

  const data: any = await response.json()
  const pageUrl: string = data?.data?.url
  if (!pageUrl) throw new Error('No URL returned from image host')

  return pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
}

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

      // YouTube never settles on networkidle2 (endless analytics), so use
      // domcontentloaded + a fixed wait for the player to initialize.
      const isYouTube = /youtube\.com|youtu\.be/i.test(targetUrl)
      if (isYouTube) {
        // Resolve shorts/youtu.be to /watch?v= for consistent player loading
        const ytId = targetUrl.match(/(?:shorts\/|youtu\.be\/|[?&]v=)([^&?/\s]{11})/)?.[1]
        const watchUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : targetUrl
        await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
        await new Promise((r) => setTimeout(r, 5000))
      } else {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
      }

      // Try clicking play to trigger video load
      await page
        .evaluate(() => {
          const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
          playBtn?.click()
        })
        .catch(() => {})

      await new Promise((r) => setTimeout(r, 2000))

      // Extract the video src from the <video> element in the page
      const videoSrc = await page.evaluate(() => {
        const video = document.querySelector('video')
        if (!video) return null
        // Try blob URL — won't work, try currentSrc or src
        const src = video.currentSrc || video.src || video.querySelector('source')?.src
        if (src && !src.startsWith('blob:')) return src
        return null
      })

      // If no direct src, download via the page's fetch context (preserves cookies)
      const videoBase64 = await page.evaluate(async (src: string | null) => {
        // Strategy 1: If we have a direct (non-blob) src, fetch it
        if (src) {
          try {
            const resp = await fetch(src)
            const buf = await resp.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            return btoa(binary)
          } catch {}
        }

        // Strategy 2: Use MediaRecorder to capture from the video element
        const video = document.querySelector('video') as HTMLVideoElement | null
        if (!video) return null

        // Restart video from beginning
        video.currentTime = 0
        video.muted = true
        await video.play().catch(() => {})

        return new Promise<string | null>((resolve) => {
          const stream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.()
          if (!stream) { resolve(null); return }

          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' })
            const buf = await blob.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            resolve(btoa(binary))
          }

          recorder.start()

          // Record for the video's duration (or max 90s)
          const duration = (video.duration || 60) * 1000
          setTimeout(() => {
            recorder.stop()
            video.pause()
          }, Math.min(duration + 500, 90000))
        })
      }, videoSrc)

      // Close browser early to free memory
      await browser.close().catch(() => {})
      browser = null

      if (!videoBase64) {
        return res.status(404).json({ error: 'No video found on page' })
      }

      const videoBuffer = Buffer.from(videoBase64, 'base64')

      if (videoBuffer.length > MAX_VIDEO_SIZE) {
        return res.status(400).json({ error: 'Video exceeds 50MB size limit' })
      }

      // Convert video to wav using ffmpeg (input may be mp4 or webm)
      const tmpVideo = path.join('/tmp', `video-${Date.now()}`)
      const tmpWav = path.join('/tmp', `audio-${Date.now()}.wav`)
      tmpFiles.push(tmpVideo, tmpWav)

      writeFileSync(tmpVideo, videoBuffer)

      try {
        execFileSync(ffmpegPath as string, [
          '-y', '-i', tmpVideo,
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
      const rawTranscript = data.text ?? ''

      if (!rawTranscript) {
        return res.status(200).json({ text: null, error: 'No speech detected' })
      }

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
          if (cleaned) {
            return res.status(200).json({ text: cleaned })
          }
        }
      } catch {
        // Structuring failed — fall through to raw transcript
      }

      return res.status(200).json({ text: rawTranscript })
    }

    if (mode === 'ocr-frames') {
      const apiKey = process.env.HF_API_KEY
      if (!apiKey) {
        return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
      }

      const isYT = /youtube\.com|youtu\.be/i.test(targetUrl)
      if (isYT) {
        const ytVid = targetUrl.match(/(?:shorts\/|youtu\.be\/|[?&]v=)([^&?/\s]{11})/)?.[1]
        const watchUrl = ytVid ? `https://www.youtube.com/watch?v=${ytVid}` : targetUrl
        await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
        await new Promise((r) => setTimeout(r, 5000))
      } else {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
      }

      // Try clicking play to trigger video load
      await page
        .evaluate(() => {
          const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
          playBtn?.click()
        })
        .catch(() => {})

      await new Promise((r) => setTimeout(r, 2000))

      // Extract the video src from the <video> element
      const videoSrc = await page.evaluate(() => {
        const video = document.querySelector('video')
        if (!video) return null
        const src = video.currentSrc || video.src || video.querySelector('source')?.src
        if (src && !src.startsWith('blob:')) return src
        return null
      })

      // Capture video — record ~30s to catch steps that appear throughout
      const videoBase64 = await page.evaluate(async (src: string | null) => {
        if (src) {
          try {
            const resp = await fetch(src)
            const buf = await resp.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            return btoa(binary)
          } catch {}
        }

        const video = document.querySelector('video') as HTMLVideoElement | null
        if (!video) return null

        video.currentTime = 0
        video.muted = true
        await video.play().catch(() => {})

        return new Promise<string | null>((resolve) => {
          const stream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.()
          if (!stream) { resolve(null); return }

          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' })
            const buf = await blob.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            resolve(btoa(binary))
          }

          recorder.start()
          const duration = (video.duration || 30) * 1000
          setTimeout(() => {
            recorder.stop()
            video.pause()
          }, Math.min(duration + 500, 30000))
        })
      }, videoSrc)

      // Close browser early to free memory
      await browser.close().catch(() => {})
      browser = null

      if (!videoBase64) {
        return res.status(404).json({ error: 'No video found on page' })
      }

      const videoBuffer = Buffer.from(videoBase64, 'base64')
      if (videoBuffer.length > MAX_VIDEO_SIZE) {
        return res.status(400).json({ error: 'Video exceeds 50MB size limit' })
      }

      // Write video to tmp and extract evenly-spaced frames with ffmpeg
      const tmpVideo = path.join('/tmp', `ocr-video-${Date.now()}`)
      tmpFiles.push(tmpVideo)
      writeFileSync(tmpVideo, videoBuffer)

      // Get total frame count to calculate interval
      let totalFrames = 300 // default estimate
      try {
        // ffmpeg writes frame count to stderr and exits non-zero for -f null
        execFileSync(ffmpegPath as string, [
          '-i', tmpVideo,
          '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-',
        ], { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (probeErr: any) {
        const stderr = probeErr?.stderr?.toString?.() ?? ''
        const frameMatch = stderr.match(/frame=\s*(\d+)/)
        if (frameMatch) totalFrames = parseInt(frameMatch[1], 10)
      }

      // Use ffmpeg's tile filter to select 16 frames and arrange them into 4 grid
      // collages (2x2 each). This gives 16 moments of coverage within the 4-image API limit.
      const interval = Math.max(1, Math.floor(totalFrames / TOTAL_FRAMES))
      const ts = Date.now()
      const gridPattern = path.join('/tmp', `ocr-grid-${ts}-%03d.jpg`)

      try {
        execFileSync(ffmpegPath as string, [
          '-y', '-i', tmpVideo,
          '-vf', `select='not(mod(n\\,${interval}))',setpts=N/FRAME_RATE/TB,tile=3x3`,
          '-frames:v', String(NUM_GRIDS),
          '-q:v', '3',
          gridPattern,
        ], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (ffmpegErr: any) {
        const stderr = ffmpegErr?.stderr?.toString?.() ?? ''
        return res.status(502).json({ error: `ffmpeg frame extraction failed: ${stderr.slice(-300)}` })
      }

      // Upload grid collages to tmpfiles.org
      const frameUrls: string[] = []
      for (let i = 1; i <= NUM_GRIDS; i++) {
        const gridPath = gridPattern.replace('%03d', String(i).padStart(3, '0'))
        tmpFiles.push(gridPath)
        try {
          const gridBuffer = readFileSync(gridPath)
          const url = await uploadFrameToTempHost(gridBuffer, i)
          frameUrls.push(url)
        } catch {
          // Grid may not exist if video was shorter than expected
          break
        }
      }

      if (frameUrls.length === 0) {
        return res.status(502).json({ error: 'No frame grids could be extracted from video' })
      }

      // Send all frame URLs to Qwen vision model in a single prompt
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
        return res.status(502).json({
          error: `Vision API error (${visionResponse.status}): ${errorText.slice(0, 200)}`,
        })
      }

      const visionData = await visionResponse.json()
      let extractedText = visionData.choices?.[0]?.message?.content ?? ''

      // Strip markdown code fences and bold markers the model sometimes adds
      extractedText = extractedText
        .replace(/```\w*\n?/g, '')
        .replace(/\*\*/g, '')
        .trim()

      return res.status(200).json({ text: extractedText || null })
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
