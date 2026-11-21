import { defineConfig, devices } from '@playwright/test';

/** The balance bot (tools/balance): plays the real game against a vite preview of dist/. Not part of CI. */
export default defineConfig({
  testDir: './tools/balance',
  timeout: 240_000,
  fullyParallel: true,
  workers: 5,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
