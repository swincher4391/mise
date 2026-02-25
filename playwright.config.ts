import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './scripts',
  testMatch: ['record-instacart-*.ts', 'test-instagram-*.ts', 'test-tiktok-*.ts', 'test-youtube-*.ts'],
  timeout: 120000,
  use: {
    browserName: 'chromium',
    headless: false,  // show the browser so you can watch the recording
  },
})
