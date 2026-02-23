import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-expect-error -- puppeteer-extra default export typing mismatch
import chromium from '@sparticuz/chromium'
// @ts-expect-error -- puppeteer-extra default export typing mismatch
import puppeteerExtra from 'puppeteer-extra'
// @ts-expect-error -- puppeteer-extra-plugin-stealth default export typing mismatch
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteerExtra.use(StealthPlugin())

export const maxDuration = 30

const VIDEO_URL_PATTERN = /\.(mp4|m4v)|video/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.body ?? {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url in request body' })
  }

  let browser
  try {
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    let videoUrl: string | null = null

    // Intercept network responses to find video URLs
    page.on('response', (response: any) => {
      if (videoUrl) return // already found one
      const reqUrl: string = response.url()
      const contentType: string = response.headers()['content-type'] ?? ''

      if (
        contentType.includes('video/mp4') ||
        contentType.includes('video/') ||
        VIDEO_URL_PATTERN.test(reqUrl)
      ) {
        videoUrl = reqUrl
      }
    })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})

    // If no video found during initial load, wait a bit for lazy-loaded content
    if (!videoUrl) {
      // Try clicking play button if present
      await page
        .evaluate(() => {
          const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
          playBtn?.click()
        })
        .catch(() => {})

      // Wait up to 5s for a video response to appear
      const deadline = Date.now() + 5000
      while (!videoUrl && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    if (!videoUrl) {
      return res.status(404).json({ error: 'No video URL found on page' })
    }

    return res.status(200).json({ videoUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Video URL extraction failed: ${message}` })
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
