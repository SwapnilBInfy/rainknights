import { defineConfig } from '@playwright/test';

// Capture scripts target the deployed build by default (per the capture
// convention: "navigates to/triggers the feature on the deployed build").
// Override with CAPTURE_URL to point at a local dev server instead.
export default defineConfig({
  testDir: './capture',
  timeout: 30_000,
  use: {
    baseURL: process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/',
    viewport: { width: 800, height: 560 },
    video: 'off', // each spec records its own short clip explicitly
  },
  reporter: [['list']],
});
