import type { VercelRequest, VercelResponse } from '@vercel/node'
// @ts-expect-error -- puppeteer-extra default export typing mismatch
import chromium from '@sparticuz/chromium'
// @ts-expect-error -- puppeteer-extra default export typing mismatch
import puppeteerExtra from 'puppeteer-extra'
// @ts-expect-error -- puppeteer-extra-plugin-stealth default export typing mismatch
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteerExtra.use(StealthPlugin())

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
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

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 })

    // Wait for JSON-LD recipe data to appear (many sites inject it via JS)
    await page
      .waitForFunction('!!document.querySelector(\'script[type="application/ld+json"]\')', {
        timeout: 10000,
      })
      .catch(() => {})

    const html = await page.evaluate(() => document.documentElement.outerHTML)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
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
