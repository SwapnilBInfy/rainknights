// Feature capture: music + sound effects. Playwright recordings carry no
// audio, so this captures the visible part — the M-key SOUND ON/OFF badge.
// See capture/region-weather.spec.ts for the pattern this follows.
import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'audio';
const BASE_URL = process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/';

test('music starts on first input and M toggles sound', async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); // first input unlocks audio; title music starts
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2400);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(2000);

  await page.keyboard.press('KeyM'); // SOUND OFF
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });
  await page.waitForTimeout(900);
  await page.keyboard.press('KeyM'); // SOUND ON
  await page.waitForTimeout(1500);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
