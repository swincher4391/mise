import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'

/**
 * Smoke coverage for the core journeys that have zero automated regression
 * protection despite a high deploy cadence. Deliberately uses the local demo
 * recipe and the client-side import path so the suite is deterministic — no
 * dependency on external recipe sites or the extraction APIs.
 */

test('landing page states what the product does', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mise' })).toBeVisible()
  await expect(page.getByText(/Paste any recipe link/i)).toBeVisible()
  // The five input modes are present as tabs.
  for (const label of ['Link', 'Photo', 'Paste text', 'Create', 'Find']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
})

test('example recipe renders instantly and can be saved', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /example recipe/i }).click()

  // The demo recipe is built locally — it should appear without a network wait.
  await expect(page.getByRole('heading', { name: /The Best Chicken Ever/i })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('bone-in, skin-on chicken thighs', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: /Save Recipe/i }).click()

  // After saving from a fresh extract we land in the library / see it saved.
  await expect(page.getByText(/The Best Chicken Ever/i).first()).toBeVisible()
})

test('a shared recipe link opens to that recipe', async ({ page }) => {
  const payload = { t: 'Shared Test Loaf', ig: ['2 cups flour', '1 egg'], st: ['Mix', 'Bake 40 min'] }
  const d = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

  await page.goto(`/?import=${encodeURIComponent(d)}`)

  await expect(page.getByRole('heading', { name: /Shared Test Loaf/i })).toBeVisible({ timeout: 5_000 })
  // Ingredients are re-parsed on import (units canonicalised), so match the name.
  await expect(page.getByText(/flour/i).first()).toBeVisible()
})

test('footer exposes the trust pages', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('.app-footer')
  await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible()
  await expect(footer.getByRole('link', { name: 'Support' })).toBeVisible()
  await expect(footer.getByRole('link', { name: 'Affiliate Disclosure' })).toBeVisible()
})

test('navigation is history-backed (back button stays in the app)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page).toHaveURL(/#\/library$/)
  await page.goBack()
  await expect(page).toHaveURL(/localhost:5173\/?$/)
  // Still inside the app, not ejected.
  await expect(page.getByRole('heading', { name: 'Mise' })).toBeVisible()
})
