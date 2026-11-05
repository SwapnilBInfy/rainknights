import { defineConfig } from '@playwright/test';

/**
 * Local-only recording of the feel follow-ups. The CI smoke config ignores
 * e2e/feel-demo.spec.ts so this clip is not part of the required check.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/feel-demo.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 780, height: 1100 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    video: { mode: 'on', size: { width: 780, height: 1100 } },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
