// Feature capture: animated character sprites (armor + weapons + walk cycle).
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
const FEATURE = 'character-sprites';
const BASE_URL = process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/';

test('playable knights show real armor/weapon art and animate while moving', async () => {
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

  // Demonstrative moment: all three knights with real armor/weapon art.
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  await page.keyboard.press('Digit1'); // Rain Knight -> Region Select
  await page.waitForTimeout(2500);
  await page.keyboard.press('Digit1'); // NYC -> GameScene
  await page.waitForTimeout(600);

  // Hold "D" to show the walk animation playing in-run.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(500);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
