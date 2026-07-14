import { defineConfig } from '@playwright/test'

/**
 * Headless variant of the recording config, for generating promo video assets
 * in a display-less environment (CI, headless server). The default
 * playwright.config.ts forces headed mode so a human can watch the recording;
 * that crashes without a display. Video capture works identically headless.
 *
 * Run: npx playwright test scripts/record-tiktok-promo.ts --config playwright-record.config.ts
 */
export default defineConfig({
  testDir: './scripts',
  testMatch: ['record-*.ts', 'test-*.ts'],
  timeout: 120000,
  use: {
    browserName: 'chromium',
    headless: true,
  },
})
