// Feature capture: Real-World Regions & live weather (Phase 1).
//
// Convention for all future feature captures (per the devlog automation
// pipeline): one spec per shipped feature, named capture/<feature-name>.spec.ts.
// The game renders entirely to a <canvas> (Menu/CharacterSelect/RegionSelect
// have no DOM elements), so scenes are driven via their keyboard shortcuts
// rather than DOM selectors — every selection screen in this game has one.
// Each spec manages its own browser/context (rather than the `page` fixture)
// so it can control exactly when the context closes, which is when
// Playwright finalizes the recorded video and `page.video().path()` becomes
// available — then it's transcoded to .mp4 with ffmpeg (Playwright records
// .webm natively) and the raw .webm is discarded. Outputs land at
// capture/output/<feature-name>.png and capture/output/<feature-name>.mp4.
import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'region-weather';
const BASE_URL = process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/';

test('two regions each show independently live weather', async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 800, height: 560 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 800, height: 560 } },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(400);

  await page.keyboard.press('Space'); // Menu -> Character Select
  await page.waitForTimeout(600);

  await page.keyboard.press('Digit1'); // pick Rain Knight -> Region Select
  await page.waitForTimeout(2500); // let both regions' live weather resolve

  // Demonstrative moment: both regions' live, independent conditions visible.
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  await page.keyboard.press('Digit1'); // pick NYC -> GameScene
  await page.waitForTimeout(1500); // show the persistent in-run weather badge

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
