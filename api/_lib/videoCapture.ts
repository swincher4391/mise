// @ts-ignore -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export interface CaptureOptions {
  maxRecordMs?: number
}

export interface CaptureResult {
  videoBuffer: Buffer
}

/**
 * Launches headless Chromium, navigates to the URL, plays the video,
 * and captures it via direct fetch or MediaRecorder.
 * Closes the browser internally after capture.
 */
export async function launchAndCaptureVideo(
  url: string,
  opts?: CaptureOptions
): Promise<CaptureResult> {
  const maxRecordMs = opts?.maxRecordMs ?? 90000
  const isYouTube = /youtube\.com|youtu\.be/i.test(url)

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  try {
    const page = await browser.newPage()

    if (isYouTube) {
      const ytId = url.match(/(?:shorts\/|youtu\.be\/|[?&]v=)([^&?/\s]{11})/)?.[1]
      const watchUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : url
      await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 5000))
    } else {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
    }

    // Try clicking play to trigger video load (YouTube auto-plays)
    if (!isYouTube) {
      await page
        .evaluate(() => {
          const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
          playBtn?.click()
        })
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Extract the video src from the <video> element
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video')
      if (!video) return null
      const src = video.currentSrc || video.src || video.querySelector('source')?.src
      if (src && !src.startsWith('blob:')) return src
      return null
    })

    // Capture via direct fetch or MediaRecorder
    const videoBase64 = await page.evaluate(async (src: string | null, maxMs: number) => {
      // Strategy 1: Direct fetch if we have a non-blob src
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

      // Strategy 2: MediaRecorder capture
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
        }, Math.min(duration + 500, maxMs))
      })
    }, videoSrc, maxRecordMs)

    if (!videoBase64) {
      throw new Error('No video found on page')
    }

    const videoBuffer = Buffer.from(videoBase64, 'base64')

    const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
    if (videoBuffer.length > MAX_VIDEO_SIZE) {
      throw new Error('Video exceeds 50MB size limit')
    }

    return { videoBuffer }
  } finally {
    await browser.close().catch(() => {})
  }
}
