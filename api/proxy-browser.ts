import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-expect-error -- @sparticuz/chromium default export typing mismatch
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const maxDuration = 30

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

const VIDEO_URL_PATTERN = /\.(mp4|m4v)|video/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  const mode = req.query.mode // 'video' to extract video URL instead of HTML

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

    if (mode === 'video') {
      // Video mode: intercept network responses to find video URLs
      let videoUrl: string | null = null

      page.on('response', (response) => {
        if (videoUrl) return
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

      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})

      // If no video found during initial load, try clicking play
      if (!videoUrl) {
        await page
          .evaluate(() => {
            const playBtn = document.querySelector('[aria-label="Play"]') as HTMLElement | null
            playBtn?.click()
          })
          .catch(() => {})

        const deadline = Date.now() + 5000
        while (!videoUrl && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      if (!videoUrl) {
        return res.status(404).json({ error: 'No video URL found on page' })
      }

      return res.status(200).json({ videoUrl })
    }

    // Default mode: return rendered HTML
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 })

    // Wait for JSON-LD recipe data to appear (many sites inject it via JS)
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
  }
}
