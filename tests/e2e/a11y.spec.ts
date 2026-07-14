import { test, expect } from '@playwright/test'

test('upgrade modal traps focus and closes on Escape', async ({ page }) => {
  await page.goto('/')
  // Open the paywall via the header pricing link.
  await page.getByRole('button', { name: /Pro is \$4\.99/i }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  // Escape closes it.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
