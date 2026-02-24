import { test } from '@playwright/test'

const APP_URL = 'https://mise.swinch.dev'
const REEL_URL = 'https://www.instagram.com/reel/DVGx2-7kfLz/'

test('Instagram reel video transcription pipeline', async ({ page }) => {
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

  // Fill the URL input (type="url" with placeholder "Paste a recipe URL...")
  const urlInput = page.locator('input[type="url"]')
  await urlInput.fill(REEL_URL)
  console.log(`\n=== Filled URL: ${REEL_URL} ===`)

  // Click the Extract submit button (the one next to the URL input, not the nav tab)
  // It's a button[type="submit"] that is NOT a .top-nav-tab
  const extractBtn = page.locator('button[type="submit"]:not(.top-nav-tab):not(.try-it-btn)')
  console.log(`\n=== Clicking Extract submit button ===`)
  await extractBtn.click()

  console.log('\n=== Waiting for extraction pipeline (up to 120s) ===')

  // Wait for loading to start then finish
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/01-loading.png' })

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

  await page.screenshot({ path: 'screenshots/02-result.png', fullPage: true })

  const bodyText = await page.evaluate(() => document.body.innerText)
  console.log(`\n=== Page text (first 500 chars) ===\n${bodyText.slice(0, 500)}`)

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
})
