import { test, expect } from '@playwright/test'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const TIKTOK_URL = 'https://www.tiktok.com/t/ZP8x6qEKt'

test('TikTok short link extraction does not instantly fail', async ({ page }) => {
  const apiCalls: { url: string; status: number; body: string; timing: number }[] = []
  const startTime = Date.now()

  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/api/')) {
      let body = ''
      try {
        body = await response.text()
        if (body.length > 500) body = body.slice(0, 500) + `... (${body.length} chars total)`
      } catch {
        body = '<could not read body>'
      }
      const entry = {
        url: url.replace(APP_URL, ''),
        status: response.status(),
        body,
        timing: Date.now() - startTime,
      }
      apiCalls.push(entry)
      console.log(`\n[${entry.timing}ms] ${response.status()} ${entry.url}`)
      console.log(`  Body: ${body}`)
    }
  })

  console.log('\n=== Navigating to Mise app ===')
  await page.goto(APP_URL, { waitUntil: 'networkidle' })

  const version = await page.textContent('.app-version').catch(() => 'not found')
  console.log(`\n=== App version: ${version} ===`)

  // Fill the URL input
  const urlInput = page.locator('input[type="url"]')
  await urlInput.fill(TIKTOK_URL)
  console.log(`\n=== Filled URL: ${TIKTOK_URL} ===`)

  // Click the Extract submit button
  const extractBtn = page.locator('button[type="submit"]:not(.top-nav-tab):not(.try-it-btn)')
  console.log(`\n=== Clicking Extract submit button ===`)
  await extractBtn.click()

  // Wait a moment for extraction to start
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/tiktok-01-loading.png' })

  // The old bug: TikTok instantly showed "blocked automated access" error.
  // Verify that does NOT happen within the first 5 seconds.
  const bodyTextEarly = await page.evaluate(() => document.body.innerText)
  console.log(`\n=== Early page text (first 300 chars) ===\n${bodyTextEarly.slice(0, 300)}`)

  expect(bodyTextEarly).not.toContain('blocked automated access')
  console.log('\n=== PASS: No instant "blocked" error ===')

  // Now wait for the full pipeline to finish (transcription + OCR can take a while)
  console.log('\n=== Waiting for extraction pipeline (up to 120s) ===')
  try {
    await page.waitForFunction(() => {
      const body = document.body.innerText
      return body.includes("Couldn't extract") ||
        body.includes('No recipe found') ||
        body.includes('blocked') ||
        document.querySelector('[class*="ingredient" i]') !== null
    }, { timeout: 120000 })
  } catch {
    console.log('\n=== TIMEOUT waiting for result ===')
  }

  await page.screenshot({ path: 'screenshots/tiktok-02-result.png', fullPage: true })

  const bodyText = await page.evaluate(() => document.body.innerText)
  console.log(`\n=== Final page text (first 500 chars) ===\n${bodyText.slice(0, 500)}`)

  // Summary
  console.log('\n\n========== API CALL SUMMARY ==========')
  for (const call of apiCalls) {
    console.log(`[${call.timing}ms] ${call.status} ${call.url}`)
    console.log(`  ${call.body.slice(0, 300)}`)
  }
  console.log('=======================================')

  const calledEndpoints = apiCalls.map((c) => c.url.split('?')[0])
  console.log('\n=== Endpoint check ===')
  console.log(`proxy:          ${calledEndpoints.some((u) => u === '/api/proxy') ? 'CALLED' : 'NOT CALLED'}`)
  console.log(`proxy-browser:  ${calledEndpoints.some((u) => u === '/api/proxy-browser') ? 'CALLED' : 'NOT CALLED'}`)
  console.log(`transcribe:     ${apiCalls.some((c) => c.url.includes('mode=transcribe')) ? 'CALLED' : 'NOT CALLED'}`)
  console.log(`ocr-frames:     ${apiCalls.some((c) => c.url.includes('mode=ocr-frames')) ? 'CALLED' : 'NOT CALLED'}`)

  // Key assertion: proxy should NOT be called for TikTok (we skip HTML fetch entirely)
  expect(calledEndpoints.some((u) => u === '/api/proxy')).toBe(false)
  console.log('\n=== PASS: /api/proxy was NOT called for TikTok ===')

  // Transcription or OCR-frames should have been attempted
  const triedVideoExtraction = apiCalls.some((c) =>
    c.url.includes('mode=transcribe') || c.url.includes('mode=ocr-frames')
  )
  expect(triedVideoExtraction).toBe(true)
  console.log('\n=== PASS: Video extraction pipeline was attempted ===')
})
